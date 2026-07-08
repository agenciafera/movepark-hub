import * as React from "react";
import { useRouteError } from "react-router-dom";
import { isStaleBuildError, recoverFromStaleBuild } from "@/lib/stale-build";

/**
 * `errorElement` da raiz. Trata o caso "build velho" (novo deploy invalidou os assets
 * com hash que o cliente antigo ainda pede) recarregando UMA vez — automatizando o
 * refresh que o usuário fazia na mão. Erros genuínos caem numa tela amigável.
 *
 * Fica FORA dos providers (o React Router substitui a subárvore da rota em erro),
 * então é auto-contido: só markup + Tailwind, sem depender de QueryClient/Auth.
 */
export function RootErrorBoundary() {
  const error = useRouteError();
  const [state, setState] = React.useState<"reloading" | "error">(() =>
    isStaleBuildError(error) ? "reloading" : "error",
  );

  React.useEffect(() => {
    if (state !== "reloading") return;
    // Se o cooldown bloquear (build novo também falhou), não fica girando pra sempre:
    // mostra o erro amigável.
    if (!recoverFromStaleBuild()) setState("error");
  }, [state]);

  if (state === "reloading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-surface-soft px-4"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-hairline border-t-ink"
            aria-hidden="true"
          />
          <p className="text-body-md text-body">Atualizando para a versão mais recente…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-soft px-4">
      <div className="max-w-lg space-y-4 rounded-md border border-hairline bg-canvas p-8 text-center shadow-tier">
        <h1 className="text-display-md text-ink">Algo deu errado</h1>
        <p className="text-body-md text-body">
          Não foi possível carregar esta página. Tente recarregar; se persistir, volte em
          instantes.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-md bg-ink px-4 py-2 text-body-sm font-medium text-canvas transition hover:opacity-90"
        >
          Recarregar
        </button>
      </div>
    </div>
  );
}
