import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/context";

export default function RoleRedirect() {
  const { session, isLoading, effectiveRole } = useAuth();
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">Carregando…</div>
    );
  }
  if (!session || !effectiveRole) return <Navigate to="/login" replace />;
  if (effectiveRole === "hub_admin") return <Navigate to="/manager" replace />;
  if (effectiveRole === "company_operator") return <Navigate to="/operator" replace />;
  return <Navigate to="/login" replace />;
}
