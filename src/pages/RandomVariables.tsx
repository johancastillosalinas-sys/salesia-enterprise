import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API, money, supabase } from "../lib/supabase";

type Variable = "cantidad" | "monto";
const OPS: [string, string][] = [["<", "<"], ["<=", "≤"], ["=", "="], [">=", "≥"], [">", ">"]];

export default function RandomVariables() {
  const [variable, setVariable] = useState<Variable>("cantidad");
  const [operator, setOperator] = useState("<=");
  const [threshold, setThreshold] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault(); setError(""); setResult(null); setBusy(true);
    let values: number[] = [];

    if (variable === "cantidad") {
      const { data, error } = await supabase.from("sale_details")
        .select("sale_id, quantity, sales!inner(status)").neq("sales.status", "anulada");
      if (error) { setBusy(false); return setError(error.message); }
      const by: Record<string, number> = {};
      ((data ?? []) as any[]).forEach((l) => { by[l.sale_id] = (by[l.sale_id] ?? 0) + l.quantity; });
      values = Object.values(by);
    } else {
      const { data, error } = await supabase.from("sales").select("total").neq("status", "anulada");
      if (error) { setBusy(false); return setError(error.message); }
      values = ((data ?? []) as any[]).map((r) => Number(r.total));
    }
    if (values.length === 0) { setBusy(false); return setError("No hay ventas para analizar."); }

    const body: any = { values, kind: variable === "cantidad" ? "discreta" : "continua" };
    if (threshold !== "") { body.operator = operator; body.threshold = Number(threshold); }

    try {
      const res = await fetch(`${API}/random-variables/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(typeof err?.detail === "string" ? err.detail : "No se pudo calcular.");
      }
      const out = await res.json();
      setResult({ ...out, variable });
      await supabase.from("statistical_analyses").insert({
        kind: "variable_aleatoria",
        input: { variable, n: values.length, operator: body.operator ?? null, threshold: body.threshold ?? null },
        result: out,
      });
    } catch (err: any) {
      setError(err.message?.includes("fetch") || err.name === "TypeError"
        ? "No se pudo conectar con el motor estadístico. Verifica que el backend esté en ejecución."
        : err.message);
    }
    setBusy(false);
  }

  const fmt = (x: number) => (result?.variable === "monto" ? money(x) : Number(x.toFixed(2)));

  return (
    <>
      <h1>Variables aleatorias</h1>
      <p className="muted">Elige una variable de tus ventas. El sistema indica su tipo y calcula su distribución y probabilidades con los datos reales.</p>

      <form className="card form" onSubmit={run}>
        <label>Variable
          <select value={variable} onChange={(e) => { setVariable(e.target.value as Variable); setResult(null); }}>
            <option value="cantidad">Cantidad de productos por venta</option>
            <option value="monto">Monto de la venta</option>
          </select></label>
        <label>Probabilidad (opcional)
          <div className="inline">
            <span>P(X</span>
            <select value={operator} onChange={(e) => setOperator(e.target.value)}>
              {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input type="number" step="any" placeholder="valor" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            <span>)</span>
          </div></label>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Analizando…" : "Analizar variable"}</button>
      </form>
      {error && <p className="error">{error}</p>}

      {result && (
        <>
          <div className="card">
            <h2>Naturaleza de la variable</h2>
            <p>
              <span className={`pill ${result.kind === "discreta" ? "ok" : "warn"}`}>{result.kind}</span>{" "}
              {result.kind === "discreta"
                ? "Toma valores enteros separados (1, 2, 3...), por eso se analiza con una frecuencia por cada valor."
                : "Puede tomar cualquier valor dentro de un rango, por eso se agrupa en intervalos."}
            </p>
          </div>

          <div className="kpis">
            <div className="card kpi"><span>Observaciones</span><strong>{result.n}</strong></div>
            <div className="card kpi"><span>Media</span><strong>{fmt(result.mean)}</strong></div>
            <div className="card kpi"><span>Mediana</span><strong>{fmt(result.median)}</strong></div>
            <div className="card kpi"><span>Rango</span><strong>{fmt(result.min)} – {fmt(result.max)}</strong></div>
            {result.mode && <div className="card kpi"><span>Moda</span><strong>{result.mode.join(", ")}</strong></div>}
          </div>

          {result.probability && (
            <div className="card">
              <h2>Probabilidad</h2>
              <p><strong>{result.probability.expression} = {(result.probability.value * 100).toFixed(1)}%</strong></p>
              <p className="muted">{result.probability.favorable} de {result.n} ventas cumplen la condición.</p>
            </div>
          )}

          <div className="charts">
            <div className="card chart">
              <h2>Distribución de frecuencias</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={result.distribution}><CartesianGrid stroke="#E3E8EF" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [v, "Ventas"]} />
                  <Bar dataKey="count" fill="#0EA5C6" radius={[3, 3, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card table-wrap">
              <table>
                <thead><tr><th>{result.kind === "discreta" ? "Valor" : "Rango"}</th><th>Frecuencia</th><th>Probabilidad</th></tr></thead>
                <tbody>
                  {result.distribution.map((d: any) => (
                    <tr key={d.label}><td>{d.label}</td><td>{d.count}</td><td>{(d.probability * 100).toFixed(1)}%</td></tr>))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}