import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./context";
import type { UserRole } from "@/types/domain";

export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { session, isLoading, effectiveRole } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">Carregando…</div>
    );
  }

  if (!session || !effectiveRole) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!roles.includes(effectiveRole)) {
    const fallback =
      effectiveRole === "hub_admin"
        ? "/manager"
        : effectiveRole === "company_operator"
          ? "/operator"
          : "/login";
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}
