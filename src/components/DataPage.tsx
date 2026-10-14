import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Col = { label: string; value: (r: any) => React.ReactNode };
type Field = { key: string; label: string; type?: "text" | "number" | "select"; required?: boolean;
  options?: string[]; from?: { table: string; label: string } };
type Props = { title: string; subtitle?: string; table: string; select?: string; order?: string;
  columns: Col[]; fields?: Field[]; createLabel?: string; editable?: boolean };

const NO_PERMISSION = "No tienes permiso para modificar este registro.";

export default function DataPage({ title, subtitle, table, select = "*", order = "created_at", columns, fields = [], createLabel = "Guardar", editable = false }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lookups, setLookups] = useState<Record<string, any[]>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from(table).select(select).order(order, { ascending: false }).limit(200);
    if (error) setError(error.message); else setRows(data ?? []);
    setLoading(false);
  }, [table, select, order]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fields.filter((f) => f.from).forEach(async (f) => {
      const { data } = await supabase.from(f.from!.table).select(`id, ${f.from!.label}`);
      setLookups((l) => ({ ...l, [f.key]: data ?? [] }));
    });
  }, []); // eslint-disable-line

  function startEdit(r: any) {
    const values: Record<string, any> = {};
    fields.forEach((f) => { values[f.key] = r[f.key] ?? ""; });
    setForm(values); setEditingId(r.id); setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() { setEditingId(null); setForm({}); setError(""); }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (editingId) {
      const payload: Record<string, any> = {};
      fields.forEach((f) => {
        const v = form[f.key];
        if (v === undefined || v === "") { if (f.type !== "number") payload[f.key] = null; }
        else payload[f.key] = f.type === "number" ? Number(v) : v;
      });
      const { data, error } = await supabase.from(table).update(payload).eq("id", editingId).select("id");
      if (error) return setError(error.message);
      if (!data || data.length === 0) return setError(NO_PERMISSION);
      cancelEdit(); load(); return;
    }
    const payload: Record<string, any> = {};
    fields.forEach((f) => {
      const v = form[f.key];
      if (v !== undefined && v !== "") payload[f.key] = f.type === "number" ? Number(v) : v;
    });
    const { error } = await supabase.from(table).insert(payload);
    if (error) setError(error.message); else { setForm({}); load(); }
  }

  async function toggleActive(r: any) {
    setError("");
    const { data, error } = await supabase.from(table).update({ active: !r.active }).eq("id", r.id).select("id");
    if (error) return setError(error.message);
    if (!data || data.length === 0) return setError(NO_PERMISSION);
    load();
  }

  const totalCols = columns.length + (editable ? 1 : 0);

  return (
    <>
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
      {fields.length > 0 && (
        <form className="card form" onSubmit={save}>
          {fields.map((f) => (
            <label key={f.key}>{f.label}
              {f.from ? (
                <select value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} required={f.required}>
                  <option value="">Seleccionar</option>
                  {(lookups[f.key] ?? []).map((o) => <option key={o.id} value={o.id}>{o[f.from!.label]}</option>)}
                </select>
              ) : f.options ? (
                <select value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} required={f.required}>
                  <option value="">Seleccionar</option>
                  {f.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type === "number" ? "number" : "text"} step={f.type === "number" ? "any" : undefined} value={form[f.key] ?? ""} required={f.required}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              )}
            </label>
          ))}
          <button className="btn" type="submit">{editingId ? "Guardar cambios" : createLabel}</button>
          {editingId && <button className="btn ghost" type="button" onClick={cancelEdit}>Cancelar</button>}
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}{editable && <th>Acciones</th>}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={totalCols}>Cargando…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={totalCols} className="muted">Aún no hay registros.</td></tr>
              : rows.map((r) => (
                <tr key={r.id} className={editable && r.active === false ? "inactive" : ""}>
                  {columns.map((c) => <td key={c.label}>{c.value(r)}</td>)}
                  {editable && (
                    <td><div className="actions">
                      <button className="btn ghost small" onClick={() => startEdit(r)}>Editar</button>
                      <button className="btn ghost small" onClick={() => toggleActive(r)}>{r.active ? "Desactivar" : "Activar"}</button>
                    </div></td>
                  )}
                </tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}