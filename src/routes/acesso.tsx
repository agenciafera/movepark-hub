import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CircleNotch } from "@phosphor-icons/react";
import { Wordmark } from "@/components/shared/Brand";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

/**
 * Link de acesso ao Recebimento (23/09/2026): /acesso/<segredo>. Troca o segredo por uma sessão do
 * dono (Edge redeem-company-access-link), faz setSession e segue para /operator/recebimento.
 * Reutilizável até a empresa terminar o cadastro. Spec: docs/specs/link-de-acesso-recebimento.md
 */
export default function AcessoPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [erro, setErro] = React.useState<{ titulo: string; texto: string } | null>(null);
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (ran.current || !token) return;
    ran.current = true;
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redeem-company-access-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          access_token?: string;
          refresh_token?: string;
          next?: string;
          reason?: string;
        };
        if (res.ok && data.access_token && data.refresh_token) {
          await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
          await qc.invalidateQueries();
          navigate(data.next ?? "/operator/recebimento", { replace: true });
          return;
        }
        if (data.reason === "done") {
          setErro({
            titulo: "Cadastro já concluído",
            texto: "Os dados de recebimento desta empresa já foram enviados. Para entrar no painel, use o login normal com o seu e-mail.",
          });
        } else {
          setErro({
            titulo: "Este link não vale mais",
            texto: "Ele pode ter sido substituído por um novo. Peça outro à Movepark, ou entre com o seu e-mail pelo login normal.",
          });
        }
      } catch {
        setErro({ titulo: "Não deu para abrir o acesso", texto: "Tente de novo em instantes ou entre pelo login normal." });
      }
    })();
  }, [token, navigate, qc]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-soft-gradient px-4 py-12">
      <Wordmark height={28} />
      {erro ? (
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="text-display-sm text-balance text-ink">{erro.titulo}</h1>
          <p className="text-body-md text-pretty text-body">{erro.texto}</p>
          <Button asChild>
            <Link to="/login?next=%2Foperator%2Frecebimento">Entrar com meu e-mail</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center">
          <CircleNotch className="h-6 w-6 animate-spin text-mp-indigo" />
          <p className="text-body-md text-body">Abrindo seu acesso…</p>
        </div>
      )}
    </div>
  );
}
