import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, supabase } from "../lib/supabase";

// Día según la hora local del usuario, no la hora UTC
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Agrupa los montos de venta en rangos y cuenta cuántas ventas caen en cada uno
function histogram(values: number[]) {
  if (!values.length) return [];
  const min = Math.min(...values), max = Math.max(...values);
  if (min === max) return [{ range: money(min), count: values.length }];
  const bins = Math.min(6, Math.max(2, Math.ceil(Math.sqrt(values.length))));
  const width = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({
    range: `${(min + i * width).toFixed(1)} – ${(min + (i + 1) * width).toFixed(1)}`, count: 0,
  }));
  values.forEach((v) => { out[Math.min(bins - 1, Math.floor((v - min) / width))].count++; });
  return out;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const vendorName = (p: any) => p?.full_name || p?.email || "Sin vendedor";

export default function Dashboard() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [vendors, setVendors] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.from("profiles").select("id,email,full_name").order("email").then(({ data }) => setVendors(data ?? []));
    supabase.from("categories").select("id,name").order("name").then(({ data }) => setCategories(data ?? []));
  }, []);

  useEffect(() => {
    setError("");
    const start = new Date(`${from}T00:00:00`).toISOString();
    const end = new Date(`${to}T23:59:59.999`).toISOString();

    let q: any = supabase.from("sales")
      .select("total,created_at,seller_user,profiles!sales_seller_user_fkey(email,full_name)")
      .neq("status", "anulada").gte("created_at", start).lte("created_at", end);
    if (vendor) q = q.eq("seller_user", vendor);
    q.then(({ data, error }: any) => { if (error) setError(error.message); else setSales(data ?? []); });

    let l: any = supabase.from("sale_details")
      .select(`quantity, subtotal, products${category ? "!inner" : ""}(name,category_id), sales!inner(status,created_at,seller_user)`)
      .neq("sales.status", "anulada").gte("sales.created_at", start).lte("sales.created_at", end);
    if (vendor) l = l.eq("sales.seller_user", vendor);
    if (category) l = l.eq("products.category_id", category);
    l.then(({ data, error }: any) => { if (error) setError(error.message); else setLines(data ?? []); });
  }, [from, to, vendor, category]);

  const totals = sales.map((s) => Number(s.total));
  const revenue = totals.reduce((a, b) => a + b, 0);

  const byDay = Object.entries(sales.reduce<Record<string, number>>((a, x) => {
    const d = localDay(x.created_at); a[d] = (a[d] ?? 0) + Number(x.total); return a;
  }, {})).sort().map(([day, total]) => ({ day: day.slice(5), total }));

  const byProduct = Object.values(lines.reduce<Record<string, { name: string; units: number; revenue: number }>>((a, l) => {
    const name = l.products?.name ?? "Sin nombre";
    a[name] = a[name] ?? { name, units: 0, revenue: 0 };
    a[name].units += l.quantity; a[name].revenue += Number(l.subtotal);
    return a;
  }, {})).sort((x, y) => y.revenue - x.revenue).slice(0, 8);

  const byVendor = Object.values(sales.reduce<Record<string, { name: string; n: number; revenue: number }>>((a, s) => {
    const key = s.seller_user ?? "sin";
    a[key] = a[key] ?? { name: vendorName(s.profiles), n: 0, revenue: 0 };
    a[key].n++; a[key].revenue += Number(s.total);
    return a;
  }, {})).sort((x, y) => y.revenue - x.revenue);

  const dist = histogram(totals);

  return (
    <>
      <h1>Dashboard</h1>
      <p className="muted">Los filtros de periodo y vendedor afectan a todo el panel. La categoría filtra solo el gráfico de ventas por producto.</p>

      <div className="card form">
        <label>Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Vendedor
          <select value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">Todos</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{vendorName(v)}</option>)}
          </select></label>
        <label>Categoría
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="kpis">
        <div className="card kpi"><span>Ingresos</span><strong>{money(revenue)}</strong></div>
        <div className="card kpi"><span>Ventas</span><strong>{sales.length}</strong></div>
        <div className="card kpi"><span>Ticket promedio (media)</span><strong>{money(sales.length ? revenue / sales.length : 0)}</strong></div>
        <div className="card kpi"><span>Venta central (mediana)</span><strong>{money(median(totals))}</strong></div>
      </div>

      <div className="card chart">
        <h2>Ventas por día</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={byDay}><CartesianGrid stroke="#E3E8EF" vertical={false} /><XAxis dataKey="day" /><YAxis />
            <Tooltip formatter={(v: number) => money(v)} /><Bar dataKey="total" fill="#1D5FA8" radius={[3, 3, 0, 0]} /></BarChart>
        </ResponsiveContainer>
      </div>

      <div className="charts">
        <div className="card chart">
          <h2>Distribución de montos de venta</h2>
          <p className="muted">Cuántas ventas caen en cada rango de monto (S/).</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dist}><CartesianGrid stroke="#E3E8EF" vertical={false} /><XAxis dataKey="range" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} /><Tooltip formatter={(v: number) => [v, "Ventas"]} />
              <Bar dataKey="count" fill="#0EA5C6" radius={[3, 3, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart">
          <h2>Ventas por producto</h2>
          <p className="muted">Ingresos de los productos más vendidos{category ? " de la categoría elegida" : ""}.</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byProduct} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid stroke="#E3E8EF" horizontal={false} />
              <XAxis type="number" /><YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number, _n, p: any) => [`${money(v)} · ${p.payload.units} unid.`, "Ingresos"]} />
              <Bar dataKey="revenue" fill="#1D5FA8" radius={[0, 3, 3, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="charts">
        <div className="card chart">
          <h2>Ventas por vendedor</h2>
          <p className="muted">Ingresos de cada vendedor en el periodo.</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byVendor} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid stroke="#E3E8EF" horizontal={false} />
              <XAxis type="number" /><YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number, _n, p: any) => [`${money(v)} · ${p.payload.n} ventas`, "Ingresos"]} />
              <Bar dataKey="revenue" fill="#0EA5C6" radius={[0, 3, 3, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Vendedor</th><th>Ventas</th><th>Ingresos</th><th>Promedio por venta</th></tr></thead>
            <tbody>
              {byVendor.length === 0
                ? <tr><td colSpan={4} className="muted">No hay ventas en este periodo.</td></tr>
                : byVendor.map((v) => (
                  <tr key={v.name}><td>{v.name}</td><td>{v.n}</td><td>{money(v.revenue)}</td><td>{money(v.revenue / v.n)}</td></tr>))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}