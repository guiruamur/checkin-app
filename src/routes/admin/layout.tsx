import { Outlet } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div className="min-h-screen p-8">
      <header className="text-xl font-bold mb-4">Admin</header>
      <Outlet />
    </div>
  );
}
