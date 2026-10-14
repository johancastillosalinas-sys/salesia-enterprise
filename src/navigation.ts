export type Role = "administrador" | "gerente" | "vendedor" | "analista" | "almacen";
export type NavItem = { path: string; label: string; roles: Role[] };
export type NavSection = { id: "operaciones" | "mantenimiento" | "analytics" | "admin"; title: string; hint: string; items: NavItem[] };

const ALL: Role[] = ["administrador", "gerente", "vendedor", "analista", "almacen"];

export const sections: NavSection[] = [
  {
    id: "operaciones", title: "Operaciones", hint: "Lo que ocurre día a día",
    items: [
      { path: "/ventas/nueva", label: "Nueva venta", roles: ["administrador", "vendedor"] },
      { path: "/ventas/historial", label: "Historial de ventas", roles: ["administrador", "gerente", "vendedor", "analista"] },
      { path: "/ventas/pagos", label: "Pagos", roles: ["administrador", "gerente", "vendedor", "analista"] },
      { path: "/inventario/stock", label: "Stock actual", roles: ALL },
      { path: "/inventario/movimientos", label: "Movimientos de inventario", roles: ["administrador", "gerente", "almacen"] },
    ],
  },
  {
    id: "mantenimiento", title: "Mantenimiento", hint: "Datos maestros",
    items: [
      { path: "/mantenimiento/clientes", label: "Clientes", roles: ["administrador", "gerente", "vendedor"] },
      { path: "/mantenimiento/productos", label: "Productos", roles: ["administrador", "gerente", "almacen"] },
      { path: "/mantenimiento/categorias", label: "Categorías", roles: ["administrador", "almacen"] },
      { path: "/mantenimiento/proveedores", label: "Proveedores", roles: ["administrador", "gerente", "almacen"] },
      { path: "/mantenimiento/empleados", label: "Empleados", roles: ["administrador", "gerente"] },
    ],
  },
  {
    id: "analytics", title: "Analytics", hint: "Análisis y estadística",
    items: [
      { path: "/analytics/dashboard", label: "Dashboard", roles: ["administrador", "gerente", "analista"] },
      { path: "/analytics/estadistica", label: "Media y mediana", roles: ["administrador", "gerente", "analista"] },
      { path: "/analytics/probabilidad", label: "Probabilidad y Bayes", roles: ["administrador", "gerente", "analista"] },
      { path: "/analytics/insights", label: "Insights", roles: ["administrador", "gerente", "analista"] },
      { path: "/analytics/reportes", label: "Reportes", roles: ["administrador", "gerente", "analista"] },
      { path: "/analytics/variables", label: "Variables aleatorias", roles: ["administrador", "gerente", "analista"] },
      { path: "/analytics/datasets", label: "Datasets y variables", roles: ["administrador", "gerente", "analista"] },
    ],
  },
  {
    id: "admin", title: "Administración", hint: "Control del sistema",
    items: [
      { path: "/admin/usuarios", label: "Usuarios y roles", roles: ["administrador"] },
      { path: "/admin/auditoria", label: "Auditoría", roles: ["administrador"] }],
  },
];