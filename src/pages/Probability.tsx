import { useState } from "react";
import { API, supabase } from "../lib/supabase";

export default function Probability() {
  const [v, setV] = useState({ p_a: "0.3", p_b_given_a: "0.8", p_b_given_not_a: "0.2" });
  const [result, setResult] = useState<any>(null); const [error, setError] = useState("");
  async function run(e: React.FormEvent) {
    e.preventDefault(); setError(""); setResult(null);
    const body = { p_a: +v.p_a, p_b_given_a: +v.p_b_given_a, p_b_given_not_a: +v.p_b_given_not_a };
    try {
      const res = await fetch(`${API}/probability/bayes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).detail ?? "Valores fuera de rango (0 a 1).");
      const out = await res.json(); setResult(out);
      await supabase.from("statistical_analyses").insert({ kind: "bayes", input: body, result: out });
    } catch (err: any) { setError(err.message || "No se pudo calcular."); }
  }
  const f = (k: keyof typeof v, label: string) => (
    <label>{label}<input type="number" step="0.01" min="0" max="1" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} required /></label>);
  return (
    <>
      <h1>Probabilidad y Bayes</h1>
      <p className="muted">P(A|B) = P(B|A) × P(A) / P(B). Ejemplo: A = el cliente compra de nuevo, B = recibió una promoción.</p>
      <form className="card form" onSubmit={run}>
        {f("p_a", "P(A)")}{f("p_b_given_a", "P(B|A)")}{f("p_b_given_not_a", "P(B|no A)")}
        <button className="btn" type="submit">Calcular</button>
      </form>
      {error && <p className="error">{error}</p>}
      {result && <div className="card"><h2>Resultado</h2><p>P(B) = {result.p_b.toFixed(4)}</p><p><strong>P(A|B) = {result.p_a_given_b.toFixed(4)}</strong></p></div>}
    </>
  );
}
