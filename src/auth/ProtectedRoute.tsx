import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
