import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Signup from "./routes/signup";
import Login from "./routes/login";
import AdminLayout from "./routes/admin/layout";
import AdminHome from "./routes/admin/home";
import AdminAgenda from "./routes/admin/agenda";
import AdminClientes from "./routes/admin/clientes";
import AdminEventos from "./routes/admin/eventos";
import AdminReportes from "./routes/admin/reportes";
import AdminAuditoria from "./routes/admin/auditoria";

export default function App() {
  const router = createBrowserRouter([
    { path: "/signup", element: <Signup /> },
    { path: "/login", element: <Login /> },
    {
      path: "/admin",
      element: <AdminLayout />,
      children: [
        { index: true, element: <AdminHome /> },
        { path: "agenda", element: <AdminAgenda /> },
        { path: "clientes", element: <AdminClientes /> },
        { path: "eventos", element: <AdminEventos /> },
        { path: "reportes", element: <AdminReportes /> },
        { path: "auditoria", element: <AdminAuditoria /> },
      ],
    },
  ]);

  return <RouterProvider router={router} />;
}
