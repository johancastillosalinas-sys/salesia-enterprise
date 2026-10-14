import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { Role, sections } from "../navigation";
import { supabase } from "../lib/supabase";

export default function Layout({ email }: { email?: string }) {
  const [role, setRole] = useState<Role | null>(null);
  const [failed, setFailed] = useState(false);
  const { pathname } = useLocation();

    useEffect(() => {
    supabase.auth.getUser().then(({ data: auth }) => {
      if (!auth.user) return setFailed(true);
      supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle().then(({ data }) => {
        if (data?.role) setRole(data.role as Role); else setFailed(true);
      });
    });
  }, []);

  if (failed) return <p className="content error">No se encontró tu perfil. Contacta al administrador.</p>;
  if (!role) return null;

  const visible = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)) }))
    .filter((s) => s.items.length > 0);
  const allowed = visible.flatMap((s) => s.items.map((i) => i.path));
  if (!allowed.includes(pathname)) return <Navigate to={allowed[0]} replace />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">SalesIA <span>Enterprise</span></div>
        {visible.map((s) => (
          <nav key={s.id} className={`group group-${s.id}`}>
            <div className="group-title">{s.title}<small>{s.hint}</small></div>
            {s.items.map((i) => (
              <NavLink key={i.path} to={i.path} className={({ isActive }) => "link" + (isActive ? " active" : "")}>
                {i.label}
              </NavLink>
            ))}
          </nav>
        ))}
      </aside>
      <div className="main">
        <header className="topbar">
          <span>{email} · {role}</span>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}