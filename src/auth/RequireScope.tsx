import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./context";

/**
 * Gate de rota por ESCOPO (ADR-005). Espelha RequireRole, mas checa permissão fina:
 * o papel do usuário na empresa em escopo ativo precisa conter `scope`. Sem permissão →
 * volta pro dashboard do operador (a checagem de papel/área é feita por RequireRole acima).
 * hub_admin (direto ou impersonando) sempre passa.
 */
export function RequireScope({ scope }: { scope: string }) {
  const { isLoading, hasScope } = useAuth();

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted">Carregando…</div>;
  }

  if (!hasScope(scope)) {
    return <Navigate to="/operator" replace />;
  }

  return <Outlet />;
}
