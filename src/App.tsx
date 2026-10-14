import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import NewSale from "./pages/NewSale";
import Dashboard from "./pages/Dashboard";
import Statistics from "./pages/Statistics";
import Probability from "./pages/Probability";
import Insights from "./pages/Insights";
import Reports from "./pages/Reports";
import RandomVariables from "./pages/RandomVariables";
import Users from "./pages/Users";
import Datasets from "./pages/Datasets";
import SalesHistory from "./pages/SalesHistory";
import DataPage from "./components/DataPage";
import { money } from "./lib/supabase";

const date = (r: any) => new Date(r.created_at).toLocaleString("es-PE");
const yn = (v: boolean) => (v ? "Activo" : "Inactivo");

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!session) return <Login />;

  return (
    <Routes>
      <Route element={<Layout email={session.user.email} />}>
        <Route path="/" element={<Navigate to="/analytics/dashboard" replace />} />

        {/* OPERACIONES · Ventas */}
        <Route path="/ventas/nueva" element={<NewSale />} />
        <Route path="/ventas/historial" element={<SalesHistory />} />
        <Route path="/ventas/pagos" element={<DataPage title="Pagos" table="payments"
          columns={[{ label: "Fecha", value: date }, { label: "Método", value: (r) => r.method }, { label: "Monto", value: (r) => money(r.amount) }]} />} />

        {/* OPERACIONES · Inventario */}
        <Route path="/inventario/stock" element={<DataPage title="Stock actual" subtitle="El stock se actualiza solo con ventas y movimientos." table="products"
          order="name" columns={[{ label: "SKU", value: (r) => r.sku }, { label: "Producto", value: (r) => r.name },
          { label: "Stock", value: (r) => r.stock }, { label: "Mínimo", value: (r) => r.min_stock },
          { label: "Situación", value: (r) => (r.stock <= r.min_stock ? <span className="pill warn">Reponer</span> : <span className="pill ok">Normal</span>) }]} />} />
        <Route path="/inventario/movimientos" element={<DataPage title="Movimientos de inventario" table="inventory_movements"
          select="id, type, quantity, reason, created_at, products(name)" createLabel="Registrar movimiento"
          fields={[{ key: "product_id", label: "Producto", from: { table: "products", label: "name" }, required: true },
          { key: "type", label: "Tipo", options: ["entrada", "salida", "ajuste"], required: true },
          { key: "quantity", label: "Cantidad", type: "number", required: true }, { key: "reason", label: "Motivo" }]}
          columns={[{ label: "Fecha", value: date }, { label: "Producto", value: (r) => r.products?.name }, { label: "Tipo", value: (r) => r.type },
          { label: "Cantidad", value: (r) => r.quantity }, { label: "Motivo", value: (r) => r.reason ?? "—" }]} />} />

        {/* MANTENIMIENTO · datos maestros, separados de Ventas */}
        <Route path="/mantenimiento/clientes" element={<DataPage title="Clientes" table="customers" editable
          fields={[{ key: "name", label: "Nombre", required: true }, { key: "document", label: "Documento" }, { key: "phone", label: "Teléfono" }, { key: "email", label: "Correo" }]}
          columns={[{ label: "Nombre", value: (r) => r.name }, { label: "Documento", value: (r) => r.document ?? "—" }, { label: "Teléfono", value: (r) => r.phone ?? "—" }, { label: "Estado", value: (r) => yn(r.active) }]} />} />
        <Route path="/mantenimiento/productos" element={<DataPage title="Productos" table="products" editable select="*, categories(name), suppliers(name)"
          fields={[{ key: "sku", label: "SKU", required: true }, { key: "name", label: "Nombre", required: true },
          { key: "category_id", label: "Categoría", from: { table: "categories", label: "name" } },
          { key: "supplier_id", label: "Proveedor", from: { table: "suppliers", label: "name" } },
          { key: "price", label: "Precio", type: "number", required: true }, { key: "min_stock", label: "Stock mínimo", type: "number" }]}
          columns={[{ label: "SKU", value: (r) => r.sku }, { label: "Producto", value: (r) => r.name }, { label: "Categoría", value: (r) => r.categories?.name ?? "—" },
          { label: "Proveedor", value: (r) => r.suppliers?.name ?? "—" }, { label: "Precio", value: (r) => money(r.price) }, { label: "Estado", value: (r) => yn(r.active) }]} />} />
        <Route path="/mantenimiento/categorias" element={<DataPage title="Categorías" table="categories" editable
          fields={[{ key: "name", label: "Nombre", required: true }]}
          columns={[{ label: "Nombre", value: (r) => r.name }, { label: "Estado", value: (r) => yn(r.active) }]} />} />
        <Route path="/mantenimiento/proveedores" element={<DataPage title="Proveedores" table="suppliers" editable
          fields={[{ key: "name", label: "Nombre", required: true }, { key: "tax_id", label: "RUC" }, { key: "phone", label: "Teléfono" }, { key: "email", label: "Correo" }]}
          columns={[{ label: "Nombre", value: (r) => r.name }, { label: "RUC", value: (r) => r.tax_id ?? "—" }, { label: "Teléfono", value: (r) => r.phone ?? "—" }, { label: "Estado", value: (r) => yn(r.active) }]} />} />
        <Route path="/mantenimiento/empleados" element={<DataPage title="Empleados" table="employees" editable
          fields={[{ key: "name", label: "Nombre", required: true }, { key: "position", label: "Cargo" }, { key: "email", label: "Correo" }]}
          columns={[{ label: "Nombre", value: (r) => r.name }, { label: "Cargo", value: (r) => r.position ?? "—" }, { label: "Estado", value: (r) => yn(r.active) }]} />} />

        {/* ANALYTICS */}
        <Route path="/analytics/dashboard" element={<Dashboard />} />
        <Route path="/analytics/estadistica" element={<Statistics />} />
        <Route path="/analytics/probabilidad" element={<Probability />} />
        <Route path="/analytics/insights" element={<Insights />} />
        <Route path="/analytics/reportes" element={<Reports />} />
        <Route path="/analytics/variables" element={<RandomVariables />} />
        <Route path="/analytics/datasets" element={<Datasets />} />

        {/* ADMINISTRACIÓN */}
        <Route path="/admin/auditoria" element={<DataPage title="Auditoría" table="audit_logs"
          columns={[{ label: "Fecha", value: date }, { label: "Acción", value: (r) => r.action }, { label: "Entidad", value: (r) => r.entity ?? "—" }]} />} />
        <Route path="/admin/usuarios" element={<Users />} />
      </Route>
    </Routes>
  );
}
