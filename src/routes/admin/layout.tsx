import { Outlet, Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/useAuth";

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold">Checkin Admin</span>
          <nav className="flex gap-4 text-sm">
            <Link to="/admin">Inicio</Link>
            <Link to="/admin/agenda">Agenda</Link>
            <Link to="/admin/clientes">Clientes</Link>
            <Link to="/admin/eventos">Eventos</Link>
            <Link to="/admin/reportes">Reportes</Link>
            <Link to="/admin/auditoria">Auditoría</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span>{user?.email}</span>
          <button onClick={handleLogout} className="underline">Salir</button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
