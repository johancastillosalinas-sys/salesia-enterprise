import { useState } from "react";
import { API, money, supabase } from "../lib/supabase";

export default function Statistics() {
  const [result, setResult] = useState<any>(null); const [error, setError] = useState("");
  async function run() {
    setError(""); setResult(null);
    const { data } = await supabase.from("sales").select("total").neq("status", "anulada");
    const values = (data ?? []).map((r: any) => Number(r.total));
    if (values.length === 0) return setError("No hay ventas para analizar.");
    try {
      const res = await fetch(`${API}/statistics/compare`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
      if (!res.ok) throw new Error();
      const out = await res.json(); setResult(out);
      await supabase.from("statistical_analyses").insert({ kind: "comparacion", input: { n: values.length }, result: out });
    } catch { setError("No se pudo conectar con el motor estadístico. Verifica que el backend esté en ejecución."); }
  }
  return (
    <>
      <h1>Media y mediana</h1><p className="muted">Calculadas sobre el monto de todas las ventas registradas.</p>
      <button className="btn" onClick={run}>Analizar ventas</button>
      {error && <p className="error">{error}</p>}
      {result && (<>
        <div className="kpis">
          <div className="card kpi"><span>Media</span><strong>{money(result.mean)}</strong></div>
          <div className="card kpi"><span>Mediana</span><strong>{money(result.median)}</strong></div>
          <div className="card kpi"><span>Observaciones</span><strong>{result.n}</strong></div>
        </div>
        <div className="card"><h2>Lectura</h2><p>{result.insight}</p><p className="muted">Diferencia media vs. mediana: {result.gap_pct}%</p></div>
      </>)}
    </>
  );
}
