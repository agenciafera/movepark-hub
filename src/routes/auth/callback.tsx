import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "@/lib/icons";
import { Wordmark } from "@/components/shared/Brand";
import { useAuth } from "@/auth/context";
import { postLoginPath } from "@/auth/postLoginRedirect";

/**
 * Recebe o callback do OAuth provider (Google).
 * O Supabase Auth troca o ?code= por uma session via detectSessionInUrl; o
 * AuthProvider escuta onAuthStateChange e popula a sessão. Aqui só aguardamos a
 * sessão/role carregarem e redirecionamos pelo destino correto (next > role).
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next");
  const { session, effectiveRole } = useAuth();

  React.useEffect(() => {
    if (!session || !effectiveRole) return;
    navigate(postLoginPath(effectiveRole, next), { replace: true });
  }, [session, effectiveRole, navigate, next]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-soft-gradient px-4 py-12">
      <Wordmark height={28} />
      <div className="flex flex-col items-center gap-2 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-mp-indigo" />
        <p className="text-body-md text-body">Concluindo seu login…</p>
      </div>
    </div>
  );
}
