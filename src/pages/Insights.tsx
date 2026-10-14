import { useEffect, useState } from "react";
import { money, supabase } from "../lib/supabase";

type Insight = { message: string; evidence: Record<string, string | number> };

const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const evidenceText = (e: Record<string, any>) =>
  Object.entries(e).map(([k, v]) => `${k}: ${v}`).join(", ");

export default function Insights() {
  const [items, setItems] = useState<Insight[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadHistory = async () => {
    const { data } = await supabase.from("insights").select("id,message,evidence,created_at")
      .order("created_at", { ascending: false }).limit(20);
    setHistory(data ?? []);
  };
  useEffect(() => { loadHistory(); }, []);

  async function generate() {
    setBusy(true); setError(""); setMsg(""); setItems([]);
    const since = new Date(Date.now() - 30 * 864e5).toISOString();

    const [s, d, p] = await Promise.all([
      supabase.from("sales").select("total,created_at").neq("status", "anulada").gte("created_at", since),
      supabase.from("sale_details").select("quantity, subtotal, products(name), sales!inner(status, created_at)")
        .neq("sales.status", "anulada").gte("sales.created_at", since),
      supabase.from("products").select("name,stock,min_stock").eq("active", true),
    ]);
    if (s.error || d.error || p.error) { setBusy(false); return setError("No se pudieron leer los datos para el análisis."); }

    const sales = (s.data ?? []) as any[];
    const lines = (d.data ?? []) as any[];
    const products = (p.data ?? []) as any[];
    const out: Insight[] = [];

    const totals = sales.map((x) => Number(x.total));
    const n = totals.length;
    const revenue = totals.reduce((a, b) => a + b, 0);
    const mean = n ? revenue / n : 0;
    const med = median(totals);

    // Regla 1: media frente a mediana
    if (n >= 3 && med > 0) {
      const gap = ((mean - med) / med) * 100;
      if (Math.abs(gap) >= 10) {
        out.push({
          message: gap > 0
            ? "La media supera a la mediana: unas pocas ventas altas elevan el ticket promedio, y la venta típica es menor."
            : "La media está por debajo de la mediana: unas pocas ventas bajas reducen el ticket promedio.",
          evidence: { media: money(mean), mediana: money(med), diferencia: `${gap.toFixed(1)}%`, ventas: n },
        });
      }
    }

    // Regla 2: tendencia de los últimos 7 días frente a los 7 anteriores
    const now = Date.now();
    const rev = (from: number, to: number) => sales
      .filter((x) => { const t = new Date(x.created_at).getTime(); return t >= now - from * 864e5 && t < now - to * 864e5; })
      .reduce((a, x) => a + Number(x.total), 0);
    const last7 = rev(7, 0), prev7 = rev(14, 7);
    if (prev7 > 0) {
      const change = ((last7 - prev7) / prev7) * 100;
      out.push({
        message: Math.abs(change) < 5
          ? "Los ingresos de los últimos 7 días se mantienen estables frente a la semana anterior."
          : `Los ingresos de los últimos 7 días ${change > 0 ? "subieron" : "bajaron"} ${Math.abs(change).toFixed(1)}% frente a los 7 días anteriores.`,
        evidence: { "últimos 7 días": money(last7), "7 días previos": money(prev7), variación: `${change.toFixed(1)}%` },
      });
    }

    // Regla 3: concentración en un producto
    const byProduct: Record<string, { revenue: number; units: number }> = {};
    lines.forEach((l) => {
      const name = l.products?.name ?? "Sin nombre";
      byProduct[name] = byProduct[name] ?? { revenue: 0, units: 0 };
      byProduct[name].revenue += Number(l.subtotal); byProduct[name].units += l.quantity;
    });
    const ranked = Object.entries(byProduct).sort((a, b) => b[1].revenue - a[1].revenue);
    const lineRevenue = ranked.reduce((a, [, v]) => a + v.revenue, 0);
    if (ranked.length >= 2 && lineRevenue > 0) {
      const [name, v] = ranked[0];
      const share = (v.revenue / lineRevenue) * 100;
      if (share >= 40) {
        out.push({
          message: `${name} concentra ${share.toFixed(0)}% de los ingresos: la venta depende bastante de un solo producto.`,
          evidence: { producto: name, ingresos: money(v.revenue), unidades: v.units, participación: `${share.toFixed(1)}%` },
        });
      }
    }

    // Regla 4: ventas atípicas (más del doble de la media)
    if (n >= 5) {
      const big = totals.filter((t) => t > 2 * mean);
      if (big.length > 0) {
        out.push({
          message: `${big.length} venta${big.length > 1 ? "s superan" : " supera"} el doble del ticket promedio y pueden estar inflando la media.`,
          evidence: { "umbral (2 × media)": money(2 * mean), "venta máxima": money(Math.max(...totals)), cantidad: big.length },
        });
      }
    }

    // Regla 5: stock bajo
    const low = products.filter((x) => x.stock <= x.min_stock);
    if (low.length > 0) {
      out.push({
        message: `${low.length} producto${low.length > 1 ? "s están" : " está"} en o bajo su stock mínimo y conviene reponer${low.length > 1 ? "los" : "lo"}.`,
        evidence: { productos: low.slice(0, 5).map((x) => `${x.name} (${x.stock})`).join(", ") },
      });
    }

    setItems(out);
    if (out.length === 0) { setBusy(false); return setMsg("Aún no hay datos suficientes para generar insights. Registra más ventas."); }

    const { error: saveError } = await supabase.from("insights").insert(out.map((i) => ({ message: i.message, evidence: i.evidence })));
    setMsg(saveError ? "Insights generados. Tu rol no puede guardarlos en el historial." : "Insights generados y guardados en el historial.");
    if (!saveError) loadHistory();
    setBusy(false);
  }

  return (
    <>
      <h1>Insights</h1>
      <p className="muted">Observaciones basadas en reglas, sobre las ventas de los últimos 30 días. Cada una muestra los números que la originan.</p>
      <button className="btn" onClick={generate} disabled={busy}>{busy ? "Analizando…" : "Generar insights"}</button>
      {error && <p className="error">{error}</p>}
      {msg && <p className="muted" style={{ marginTop: 12 }}>{msg}</p>}

      {items.map((i, k) => (
        <div key={k} className="card insight">
          <strong>{i.message}</strong>
          <p className="evidence">Evidencia: {evidenceText(i.evidence)}</p>
        </div>
      ))}

      <h2 style={{ marginTop: 28 }}>Historial</h2>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Insight</th><th>Evidencia</th></tr></thead>
          <tbody>
            {history.length === 0
              ? <tr><td colSpan={3} className="muted">Aún no hay insights guardados.</td></tr>
              : history.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleString("es-PE")}</td>
                  <td>{h.message}</td>
                  <td className="muted">{evidenceText(h.evidence ?? {})}</td>
                </tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}