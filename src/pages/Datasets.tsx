import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API, money, supabase } from "../lib/supabase";

type Dataset = { id: string; name: string; date_from: string; date_to: string; n_observations: number; created_at: string };
type Variable = { id: string; name: string; label: string; var_type: string };

const TYPE_LABEL: Record<string, string> = {
  cualitativa_nominal: "Cualitativa nominal", cualitativa_ordinal: "Cualitativa ordinal",
  cuantitativa_discreta: "Cuantitativa discreta", cuantitativa_continua: "Cuantitativa continua",
};
const TYPE_HELP: Record<string, string> = {
  cualitativa_nominal: "Categorías sin orden natural. Se describe con frecuencias y moda.",
  cualitativa_ordinal: "Categorías con orden natural. Se describe con frecuencias y moda.",
  cuantitativa_discreta: "Valores enteros separados. Admite media, mediana y frecuencias por valor.",
  cuantitativa_continua: "Cualquier valor dentro de un rango. Admite media, mediana y rangos.",
};

// Variables que se generan desde las ventas y su clasificación
const VARS = [
  { name: "monto", label: "Monto de la venta", type: "cuantitativa_continua" },
  { name: "cantidad_productos", label: "Cantidad de productos por venta", type: "cuantitativa_discreta" },
  { name: "cliente", label: "Cliente", type: "cualitativa_nominal" },
  { name: "metodo_pago", label: "Método de pago", type: "cualitativa_nominal" },
  { name: "estado", label: "Estado de la venta", type: "cualitativa_nominal" },
];

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// Supabase devuelve como máximo 1000 filas por consulta: se lee por tramos
async function fetchAll(variableId: string) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("observations").select("value_num,value_text")
      .eq("variable_id", variableId).order("row_index").range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const friendly = (msg: string) =>
  msg.toLowerCase().includes("row-level security") ? "Tu rol no puede hacer esta acción." : msg;

export default function Datasets() {
  const [name, setName] = useState("");
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selected, setSelected] = useState<Dataset | null>(null);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDatasets = async () => {
    const { data, error } = await supabase.from("datasets").select("*").order("created_at", { ascending: false });
    if (error) setError(friendly(error.message)); else setDatasets((data ?? []) as Dataset[]);
  };
  useEffect(() => { loadDatasets(); }, []);

  async function openDataset(ds: Dataset) {
    setSelected(ds); setResult(null); setError(""); setMsg("");
    const { data, error } = await supabase.from("dataset_variables").select("id,name,label,var_type").eq("dataset_id", ds.id).order("created_at");
    if (error) setError(friendly(error.message)); else setVariables((data ?? []) as Variable[]);
  }

  async function createDataset(e: React.FormEvent) {
    e.preventDefault(); setError(""); setMsg(""); setBusy(true);
    const start = new Date(`${from}T00:00:00`).toISOString();
    const end = new Date(`${to}T23:59:59.999`).toISOString();

    const { data: sales, error: sErr } = await supabase.from("sales")
      .select("total,status,customers(name),payments(method),sale_details(quantity)")
      .neq("status", "anulada").gte("created_at", start).lte("created_at", end).order("created_at");
    if (sErr) { setBusy(false); return setError(friendly(sErr.message)); }
    const rows = ((sales ?? []) as any[]).map((s) => ({
      monto: Number(s.total),
      cantidad_productos: (s.sale_details ?? []).reduce((a: number, d: any) => a + d.quantity, 0),
      cliente: s.customers?.name ?? "Cliente general",
      metodo_pago: s.payments?.[0]?.method ?? "sin pago",
      estado: s.status as string,
    }));
    if (rows.length === 0) { setBusy(false); return setError("No hay ventas en ese rango de fechas."); }

    const dsName = name.trim() || `Ventas ${from} al ${to}`;
    const { data: ds, error: dErr } = await supabase.from("datasets")
      .insert({ name: dsName, date_from: from, date_to: to, n_observations: rows.length }).select().single();
    if (dErr || !ds) { setBusy(false); return setError(friendly(dErr?.message ?? "No se pudo crear el dataset.")); }

    const cleanup = async (m: string) => {
      await supabase.from("datasets").delete().eq("id", ds.id);
      setBusy(false); setError(friendly(m));
    };

    const { data: vars, error: vErr } = await supabase.from("dataset_variables")
      .insert(VARS.map((v) => ({ dataset_id: ds.id, name: v.name, label: v.label, var_type: v.type }))).select("id,name");
    if (vErr || !vars) return cleanup(vErr?.message ?? "No se pudieron crear las variables.");

    const idByName: Record<string, string> = Object.fromEntries(vars.map((v: any) => [v.name, v.id]));
    const obs: any[] = [];
    rows.forEach((r, i) => VARS.forEach((v) => {
      const value = (r as any)[v.name];
      obs.push({
        dataset_id: ds.id, variable_id: idByName[v.name], row_index: i,
        value_num: v.type.startsWith("cuantitativa") ? value : null,
        value_text: v.type.startsWith("cualitativa") ? String(value) : null,
      });
    }));
    for (let i = 0; i < obs.length; i += 500) {
      const { error: oErr } = await supabase.from("observations").insert(obs.slice(i, i + 500));
      if (oErr) return cleanup(oErr.message);
    }

    await supabase.from("audit_logs").insert({ action: "crear_dataset", entity: "datasets", entity_id: ds.id, detail: { nombre: dsName, observaciones: rows.length } });
    setName(""); setMsg(`Dataset creado con ${rows.length} observaciones y ${VARS.length} variables.`);
    setBusy(false); await loadDatasets(); openDataset(ds as Dataset);
  }

  async function removeDataset(ds: Dataset) {
    if (!window.confirm(`¿Eliminar el dataset "${ds.name}"? Se borrarán sus variables y observaciones.`)) return;
    setError(""); setMsg("");
    const { data, error } = await supabase.from("datasets").delete().eq("id", ds.id).select("id");
    if (error) return setError(friendly(error.message));
    if (!data || data.length === 0) return setError("Tu rol no puede eliminar datasets.");
    await supabase.from("audit_logs").insert({ action: "eliminar_dataset", entity: "datasets", entity_id: ds.id, detail: { nombre: ds.name } });
    if (selected?.id === ds.id) { setSelected(null); setVariables([]); setResult(null); }
    loadDatasets();
  }

  async function analyze(v: Variable) {
    setError(""); setResult(null); setBusy(true);
    try {
      const rows = await fetchAll(v.id);
      const quant = v.var_type.startsWith("cuantitativa");
      const url = quant ? `${API}/random-variables/analyze` : `${API}/variables/frequency`;
      const body = quant
        ? { values: rows.map((r) => Number(r.value_num)), kind: v.var_type === "cuantitativa_discreta" ? "discreta" : "continua" }
        : { values: rows.map((r) => String(r.value_text)) };
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("El motor estadístico rechazó el análisis.");
      const out = await res.json();
      setResult({ ...out, variable: v });
      await supabase.from("statistical_analyses").insert({
        kind: "variable_estadistica",
        input: { dataset_id: selected?.id, dataset: selected?.name, variable: v.name, tipo: v.var_type, n: rows.length },
        result: out,
      });
    } catch (err: any) {
      setError(err instanceof TypeError
        ? "No se pudo conectar con el motor estadístico. Verifica que el backend esté en ejecución."
        : friendly(err.message ?? "No se pudo analizar la variable."));
    }
    setBusy(false);
  }

  const money_ = result?.variable?.name === "monto";
  const fmt = (x: number) => (money_ ? money(x) : Number(x.toFixed(2)));
  const quant = result?.kind === "discreta" || result?.kind === "continua";

  return (
    <>
      <h1>Datasets y variables</h1>
      <p className="muted">Un dataset es una foto de tus ventas en un rango de fechas. El sistema define sus variables y las clasifica según su naturaleza.</p>

      <form className="card form" onSubmit={createDataset}>
        <label>Nombre (opcional)<input value={name} placeholder="Ventas de octubre" onChange={(e) => setName(e.target.value)} /></label>
        <label>Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Procesando…" : "Crear dataset desde ventas"}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {msg && <p className="okmsg">{msg}</p>}

      <h2>Datasets</h2>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Periodo</th><th>Observaciones</th><th>Creado</th><th>Acciones</th></tr></thead>
          <tbody>
            {datasets.length === 0
              ? <tr><td colSpan={5} className="muted">Aún no hay datasets.</td></tr>
              : datasets.map((d) => (
                <tr key={d.id} className={selected?.id === d.id ? "selected" : ""}>
                  <td>{d.name}</td><td>{d.date_from} al {d.date_to}</td><td>{d.n_observations}</td>
                  <td>{new Date(d.created_at).toLocaleString("es-PE")}</td>
                  <td><div className="actions">
                    <button className="btn ghost small" onClick={() => openDataset(d)}>Ver variables</button>
                    <button className="btn ghost small" onClick={() => removeDataset(d)}>Eliminar</button>
                  </div></td>
                </tr>))}
          </tbody>
        </table>
      </div>

      {selected && (
        <>
          <h2>Variables de «{selected.name}»</h2>
          <div className="card table-wrap">
            <table>
              <thead><tr><th>Variable</th><th>Clasificación</th><th>Qué significa</th><th></th></tr></thead>
              <tbody>
                {variables.map((v) => (
                  <tr key={v.id}>
                    <td>{v.label}</td>
                    <td><span className={`pill ${v.var_type.startsWith("cuantitativa") ? "ok" : "warn"}`}>{TYPE_LABEL[v.var_type]}</span></td>
                    <td className="muted">{TYPE_HELP[v.var_type]}</td>
                    <td><button className="btn ghost small" disabled={busy} onClick={() => analyze(v)}>Analizar</button></td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {result && (
        <>
          <h2>Análisis de «{result.variable.label}»</h2>
          <div className="kpis">
            <div className="card kpi"><span>Observaciones</span><strong>{result.n}</strong></div>
            {quant ? (<>
              <div className="card kpi"><span>Media</span><strong>{fmt(result.mean)}</strong></div>
              <div className="card kpi"><span>Mediana</span><strong>{fmt(result.median)}</strong></div>
              <div className="card kpi"><span>Rango</span><strong>{fmt(result.min)} – {fmt(result.max)}</strong></div>
              {result.mode && <div className="card kpi"><span>Moda</span><strong>{result.mode.join(", ")}</strong></div>}
            </>) : (<>
              <div className="card kpi"><span>Categorías</span><strong>{result.categories}</strong></div>
              <div className="card kpi"><span>Moda</span><strong>{result.mode.join(", ")}</strong></div>
            </>)}
          </div>
          <div className="charts">
            <div className="card chart">
              <h2>Distribución de frecuencias</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={result.distribution}><CartesianGrid stroke="#E3E8EF" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} />
                  <Tooltip formatter={(val: number) => [val, "Frecuencia"]} />
                  <Bar dataKey="count" fill="#0EA5C6" radius={[3, 3, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card table-wrap">
              <table>
                <thead><tr><th>{quant ? (result.kind === "discreta" ? "Valor" : "Rango") : "Categoría"}</th><th>Frecuencia</th><th>Proporción</th></tr></thead>
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