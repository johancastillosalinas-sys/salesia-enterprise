import { useState } from "react";
import { money, supabase } from "../lib/supabase";

type Kind = "ventas" | "productos" | "clientes" | "vendedores" | "estadistico";
type Table = { title: string; headers: string[]; rows: (string | number)[][] };

const TITLES: Record<Kind, string> = {
  ventas: "Reporte de ventas", productos: "Reporte de productos",
  clientes: "Reporte de clientes", estadistico: "Reporte estadístico",
    vendedores: "Reporte de vendedores",
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export default function Reports() {
  const [kind, setKind] = useState<Kind>("ventas");
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [table, setTable] = useState<Table | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true); setError(""); setTable(null);
    const start = new Date(`${from}T00:00:00`).toISOString();
    const end = new Date(`${to}T23:59:59.999`).toISOString();
    const title = `${TITLES[kind]} · ${from} al ${to}`;

        if (kind === "vendedores") {
      const { data, error } = await supabase.from("sales")
        .select("total,seller_user,profiles!sales_seller_user_fkey(email,full_name)")
        .neq("status", "anulada").gte("created_at", start).lte("created_at", end);
      if (error) { setBusy(false); return setError(error.message); }
      const by: Record<string, { name: string; n: number; total: number }> = {};
      ((data ?? []) as any[]).forEach((r) => {
        const key = r.seller_user ?? "sin";
        const name = r.profiles?.full_name || r.profiles?.email || "Sin vendedor";
        by[key] = by[key] ?? { name, n: 0, total: 0 };
        by[key].n++; by[key].total += Number(r.total);
      });
      setTable({ title, headers: ["Vendedor", "Ventas", "Ingresos", "Promedio por venta"],
        rows: Object.values(by).sort((a, b) => b.total - a.total)
          .map((v) => [v.name, v.n, v.total.toFixed(2), (v.total / v.n).toFixed(2)]) });
      setBusy(false);
      return;
    }

    if (kind === "ventas" || kind === "clientes") {
      const { data, error } = await supabase.from("sales").select("created_at,total,status,customers(name)")
        .gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false });
      if (error) { setBusy(false); return setError(error.message); }
      const rows = (data ?? []) as any[];
      if (kind === "ventas") {
        setTable({ title, headers: ["Fecha", "Cliente", "Estado", "Total"],
          rows: rows.map((r) => [new Date(r.created_at).toLocaleString("es-PE"), r.customers?.name ?? "Cliente general", r.status, Number(r.total).toFixed(2)]) });
      } else {
        const by: Record<string, { n: number; total: number }> = {};
        rows.filter((r) => r.status !== "anulada").forEach((r) => {
          const k = r.customers?.name ?? "Cliente general";
          by[k] = by[k] ?? { n: 0, total: 0 }; by[k].n++; by[k].total += Number(r.total);
        });
        setTable({ title, headers: ["Cliente", "Compras", "Total", "Ticket promedio"],
          rows: Object.entries(by).sort((a, b) => b[1].total - a[1].total)
            .map(([k, v]) => [k, v.n, v.total.toFixed(2), (v.total / v.n).toFixed(2)]) });
      }
    } else if (kind === "productos") {
      const { data, error } = await supabase.from("sale_details")
        .select("quantity,subtotal,products(sku,name),sales!inner(status,created_at)")
        .neq("sales.status", "anulada").gte("sales.created_at", start).lte("sales.created_at", end);
      if (error) { setBusy(false); return setError(error.message); }
      const by: Record<string, { sku: string; units: number; revenue: number }> = {};
      ((data ?? []) as any[]).forEach((l) => {
        const name = l.products?.name ?? "Sin nombre";
        by[name] = by[name] ?? { sku: l.products?.sku ?? "—", units: 0, revenue: 0 };
        by[name].units += l.quantity; by[name].revenue += Number(l.subtotal);
      });
      setTable({ title, headers: ["SKU", "Producto", "Unidades", "Ingresos"],
        rows: Object.entries(by).sort((a, b) => b[1].revenue - a[1].revenue)
          .map(([name, v]) => [v.sku, name, v.units, v.revenue.toFixed(2)]) });
    } else {
      const { data, error } = await supabase.from("statistical_analyses").select("created_at,kind,input,result")
        .gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false });
      if (error) { setBusy(false); return setError(error.message); }
      setTable({ title, headers: ["Fecha", "Tipo", "Entrada", "Resultado"],
        rows: ((data ?? []) as any[]).map((r) => [new Date(r.created_at).toLocaleString("es-PE"), r.kind, JSON.stringify(r.input), JSON.stringify(r.result)]) });
    }
    setBusy(false);
  }

  function exportCsv() {
    if (!table) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [table.headers, ...table.rows].map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reporte-${kind}-${from}_${to}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <h1>Reportes</h1>
      <p className="muted no-print">Elige el tipo de reporte y el rango de fechas.</p>
      <div className="card form no-print">
        <label>Reporte
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="ventas">Ventas</option><option value="productos">Productos</option>
            <option value="clientes">Clientes</option><option value="estadistico">Estadístico</option>
            <option value="vendedores">Vendedores</option>
          </select></label>
        <label>Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn" onClick={generate} disabled={busy}>{busy ? "Generando…" : "Generar reporte"}</button>
      </div>
      {error && <p className="error">{error}</p>}
      {table && (
        <>
          <div className="report-head">
            <h2>{table.title}</h2>
            <div className="actions no-print">
              <button className="btn ghost" onClick={exportCsv}>Exportar CSV</button>
              <button className="btn ghost" onClick={() => window.print()}>Imprimir</button>
            </div>
          </div>
          <div className="card table-wrap">
            <table>
              <thead><tr>{table.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {table.rows.length === 0
                  ? <tr><td colSpan={table.headers.length} className="muted">No hay datos en ese rango de fechas.</td></tr>
                  : table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}