import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import Signup from "./routes/signup";
import Login from "./routes/login";
import AdminLayout from "./routes/admin/layout";
import AdminHome from "./routes/admin/home";
import AdminAgenda from "./routes/admin/agenda";
import AdminClientes from "./routes/admin/clientes";
import AdminEventos from "./routes/admin/eventos";
import AdminReportes from "./routes/admin/reportes";
import AdminAuditoria from "./routes/admin/auditoria";

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "/signup", element: <Signup /> },
  { path: "/login", element: <Login /> },
  {
    path: "/admin",
    element: (
      <ProtectedRoute>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminHome /> },
      { path: "agenda", element: <AdminAgenda /> },
      { path: "clientes", element: <AdminClientes /> },
      { path: "eventos", element: <AdminEventos /> },
      { path: "reportes", element: <AdminReportes /> },
      { path: "auditoria", element: <AdminAuditoria /> },
    ],
  },
];

const router = createBrowserRouter(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
