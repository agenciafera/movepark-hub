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
    const next = encodeURIComponent(location.pathname + location.search);
    // Rotas customer mandam pra /entrar; backoffice continua em /login
    const loginPath = roles.includes("customer") ? "/entrar" : "/login";
    return <Navigate to={`${loginPath}?next=${next}`} replace />;
  }

  if (!roles.includes(effectiveRole)) {
    const fallback =
      effectiveRole === "hub_admin"
        ? "/manager"
        : effectiveRole === "company_operator"
          ? "/operator"
          : "/";
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}
