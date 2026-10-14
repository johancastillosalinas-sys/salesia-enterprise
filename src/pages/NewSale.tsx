import { useEffect, useState } from "react";
import { money, supabase } from "../lib/supabase";

type Line = { product_id: string; quantity: number };

export default function NewSale() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customer, setCustomer] = useState("");
  const [method, setMethod] = useState("efectivo");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: 1 }]);
  const [msg, setMsg] = useState(""); const [error, setError] = useState("");

  const load = async () => {
    setCustomers((await supabase.from("customers").select("id,name").eq("active", true)).data ?? []);
    setProducts((await supabase.from("products").select("id,name,price,stock").eq("active", true).order("name")).data ?? []);
  };
  useEffect(() => { load(); }, []);

  const price = (id: string) => products.find((p) => p.id === id)?.price ?? 0;
  const total = lines.reduce((s, l) => s + price(l.product_id) * l.quantity, 0);
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  async function confirm() {
    setError(""); setMsg("");
    const items = lines.filter((l) => l.product_id);
    if (items.length === 0) return setError("Agrega al menos un producto.");
    const { error } = await supabase.rpc("register_sale", { p_customer_id: customer || null, p_items: items, p_method: method });
    if (error) return setError(error.message);
    setMsg("Venta registrada. El inventario ya se actualizó.");
    setLines([{ product_id: "", quantity: 1 }]); load();
  }

  return (
    <>
      <h1>Nueva venta</h1>
      <div className="card form">
        <label>Cliente
          <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">Cliente general</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        <label>Método de pago
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option><option value="yape_plin">Yape / Plin</option>
          </select></label>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td><select value={l.product_id} onChange={(e) => setLine(i, { product_id: e.target.value })}>
                  <option value="">Seleccionar</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} (stock {p.stock})</option>)}</select></td>
                <td><input type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Math.max(1, Number(e.target.value)) })} /></td>
                <td>{money(price(l.product_id))}</td><td>{money(price(l.product_id) * l.quantity)}</td>
                <td><button className="btn ghost" onClick={() => setLines(lines.filter((_, k) => k !== i))}>Quitar</button></td>
              </tr>))}
          </tbody>
        </table>
        <div className="sale-foot">
          <button className="btn ghost" onClick={() => setLines([...lines, { product_id: "", quantity: 1 }])}>Agregar producto</button>
          <strong className="total">Total {money(total)}</strong>
          <button className="btn" onClick={confirm}>Registrar venta</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}{msg && <p className="okmsg">{msg}</p>}
    </>
  );
}
