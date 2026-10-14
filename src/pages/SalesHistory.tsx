import { Fragment, useEffect, useState } from "react";
import { money, supabase } from "../lib/supabase";

export default function SalesHistory() {
  const [rows, setRows] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ lines: any[]; payments: any[] } | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const { data, error } = await supabase.from("sales")
      .select("id,total,status,created_at,customers(name),profiles!sales_seller_user_fkey(email,full_name)")
      .order("created_at", { ascending: false }).limit(200);
    if (error) setError(error.message); else setRows(data ?? []);
  }

  useEffect(() => {
    load();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle()
        .then(({ data: p }) => setIsAdmin(p?.role === "administrador"));
    });
  }, []);

  async function toggle(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id); setDetail(null); setError("");
    const [l, p] = await Promise.all([
      supabase.from("sale_details").select("quantity,unit_price,subtotal,products(name)").eq("sale_id", id),
      supabase.from("payments").select("method,amount").eq("sale_id", id),
    ]);
    if (l.error || p.error) return setError((l.error ?? p.error)!.message);
    setDetail({ lines: l.data ?? [], payments: p.data ?? [] });
  }

  async function cancel(s: any) {
    if (!window.confirm(`¿Anular la venta de ${money(s.total)}? Los productos volverán al inventario y esta acción no se puede deshacer.`)) return;
    setError(""); setMsg("");
    const { error } = await supabase.rpc("cancel_sale", { p_sale_id: s.id });
    if (error) return setError(error.message);
    setMsg("Venta anulada y stock devuelto al inventario.");
    setOpenId(null); setDetail(null); load();
  }

  const pill = (st: string) => (st === "pagada" ? "ok" : st === "anulada" ? "off" : "warn");

  return (
    <>
      <h1>Historial de ventas</h1>
      {error && <p className="error">{error}</p>}
      {msg && <p className="okmsg">{msg}</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={6} className="muted">Aún no hay ventas.</td></tr>
              : rows.map((s) => (
                <Fragment key={s.id}>
                  <tr className={s.status === "anulada" ? "inactive" : ""}>
                    <td>{new Date(s.created_at).toLocaleString("es-PE")}</td>
                    <td>{s.customers?.name ?? "Cliente general"}</td>
                    <td>{s.profiles?.full_name || s.profiles?.email || "—"}</td>
                    <td><span className={`pill ${pill(s.status)}`}>{s.status}</span></td>
                    <td>{money(s.total)}</td>
                    <td><div className="actions">
                      <button className="btn ghost small" onClick={() => toggle(s.id)}>{openId === s.id ? "Ocultar" : "Ver detalle"}</button>
                      {isAdmin && s.status !== "anulada" && <button className="btn ghost small" onClick={() => cancel(s)}>Anular</button>}
                    </div></td>
                  </tr>
                  {openId === s.id && (
                    <tr><td colSpan={6} className="detail">
                      {!detail ? "Cargando…" : (
                        <>
                          <table>
                            <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr></thead>
                            <tbody>
                              {detail.lines.map((l, i) => (
                                <tr key={i}><td>{l.products?.name}</td><td>{l.quantity}</td><td>{money(l.unit_price)}</td><td>{money(l.subtotal)}</td></tr>))}
                            </tbody>
                          </table>
                          <p className="muted" style={{ margin: "10px 0 0" }}>
                            Pago: {detail.payments.length
                              ? detail.payments.map((p) => `${p.method} ${money(p.amount)}`).join(", ")
                              : "sin pago registrado"}
                          </p>
                        </>
                      )}
                    </td></tr>
                  )}
                </Fragment>))}
          </tbody>
        </table>
      </div>
    </>
  );
}