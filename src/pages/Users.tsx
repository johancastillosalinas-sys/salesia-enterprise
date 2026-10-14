import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const ROLES = ["administrador", "gerente", "vendedor", "analista", "almacen"];

type Profile = { id: string; email: string | null; full_name: string | null; role: string; created_at: string };

export default function Users() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [me, setMe] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const { data, error } = await supabase.from("profiles").select("id,email,full_name,role,created_at").order("created_at");
    if (error) setError(error.message); else setRows((data ?? []) as Profile[]);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? ""));
    load();
  }, []);

  async function changeRole(p: Profile, role: string) {
    setError(""); setMsg("");
    if (role === p.role) return;
    const { data, error } = await supabase.from("profiles").update({ role }).eq("id", p.id).select("id");
    if (error) return setError(error.message);
    if (!data || data.length === 0) return setError("No tienes permiso para cambiar roles.");
    await supabase.from("audit_logs").insert({
      action: "cambiar_rol", entity: "profiles", entity_id: p.id,
      detail: { usuario: p.email, de: p.role, a: role },
    });
    setMsg(`Rol de ${p.email ?? "usuario"} cambiado a ${role}.`);
    load();
  }

  return (
    <>
      <h1>Usuarios y roles</h1>
      <p className="muted">Para crear un usuario nuevo usa Authentication en Supabase. Aquí defines qué puede hacer cada uno.</p>
      {error && <p className="error">{error}</p>}
      {msg && <p className="okmsg">{msg}</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Correo</th><th>Nombre</th><th>Rol</th><th>Creado</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={4} className="muted">Cargando…</td></tr>
              : rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.email ?? "—"}{p.id === me && <span className="pill ok" style={{ marginLeft: 8 }}>Tú</span>}</td>
                  <td>{p.full_name ?? "—"}</td>
                  <td>
                    <select value={p.role} disabled={p.id === me} title={p.id === me ? "No puedes cambiar tu propio rol" : ""}
                      onChange={(e) => changeRole(p, e.target.value)}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>{new Date(p.created_at).toLocaleDateString("es-PE")}</td>
                </tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}