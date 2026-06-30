import * as React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "./context";
import type { UserRole } from "@/types/domain";

export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { session, isLoading, effectiveRole } = useAuth();
  const location = useLocation();

  // Logado, mas com papel que não acessa esta área (ex.: cliente tentando /manager).
  const unauthorized = !!session && !!effectiveRole && !roles.includes(effectiveRole);

  React.useEffect(() => {
    if (unauthorized) toast.error("Você não tem acesso a essa área.");
  }, [unauthorized]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">Carregando…</div>
    );
  }

  if (!session || !effectiveRole) {
    const next = encodeURIComponent(location.pathname + location.search);
    // Login universal e passwordless em /login (clientes e backoffice).
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (unauthorized) {
    // Bounce pro painel do próprio papel (ou home, no caso do cliente).
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
