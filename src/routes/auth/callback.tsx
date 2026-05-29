import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Wordmark } from "@/components/shared/Brand";
import { supabase } from "@/lib/supabase";

/**
 * Recebe o callback do OAuth provider (Google).
 * Supabase Auth automaticamente troca o ?code= por uma session via
 * detectSessionInUrl. Aqui só aguardamos e redirecionamos.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next");

  React.useEffect(() => {
    let timeout: number | undefined;
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        // dá tempo do AuthProvider atualizar role antes do redirect
        timeout = window.setTimeout(() => {
          navigate(next ?? "/", { replace: true });
        }, 250);
      }
    });
    // Fallback: se já tem session ao montar, redireciona
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        timeout = window.setTimeout(() => {
          navigate(next ?? "/", { replace: true });
        }, 250);
      }
    });
    return () => {
      sub.data.subscription.unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
  }, [navigate, next]);

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
