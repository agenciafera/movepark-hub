import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/context";
import { toDataUrl } from "@/lib/qr";
import { useRecipient, useSyncRecipient } from "./api";
import {
  formatKycCountdown,
  kycMsRemaining,
  resolveKycBannerState,
} from "./RecipientKycBanner.logic";

/**
 * Banner para o PARCEIRO: prova de vida (KYC) do recebedor no painel do operador.
 *
 * Quatro estados. Com link vivo, mostra o QR e um contador, porque o link do gateway vale 20
 * minutos e sem o relógio na tela a pessoa descobre que expirou só depois de tentar. Expirado,
 * oferece gerar outro. Sem link (o gateway já exigiu a verificação mas nada foi emitido), avisa
 * que está sendo preparado, senão o parceiro fica parado sem saber que precisa agir.
 */
export function RecipientKycBanner({ companyId }: { companyId: string | undefined }) {
  const { data: recipient } = useRecipient(companyId);
  const { hasScope } = useAuth();
  const sync = useSyncRecipient();

  // Relógio próprio de 1s: o estado precisa virar sozinho quando o contador zera, sem depender
  // de refetch nem de o parceiro mexer na tela.
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = resolveKycBannerState(recipient, now);
  const kycUrl = state.kind === "ready" ? state.url : null;

  const { data: qr } = useQuery({
    queryKey: ["kyc-qr", kycUrl],
    queryFn: () => toDataUrl(kycUrl!, 160),
    enabled: !!kycUrl,
  });

  if (state.kind === "hidden") return null;

  const canReissue = !!companyId && hasScope("payouts:write", companyId);

  async function reissue() {
    if (!companyId) return;
    try {
      await sync.mutateAsync({ company_id: companyId, action: "reissue_kyc" });
      toast.success("Link novo gerado. Você tem 20 minutos.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o link agora.");
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-badge-pending-fg/30 bg-badge-pending-bg p-4 tablet:flex-row tablet:items-center">
      {state.kind === "ready" && qr && (
        <img
          src={qr}
          alt="QR code da prova de vida"
          className="h-32 w-32 shrink-0 self-center rounded-sm bg-white p-1"
        />
      )}
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-badge-pending-fg" />
          <div className="flex flex-col gap-1">
            <p className="text-body-sm font-medium text-ink">Prova de vida pendente</p>

            {state.kind === "ready" && (
              <>
                <p className="text-caption text-muted">
                  Falta a verificação de identidade para liberar seus repasses. Escaneie o QR code
                  com o celular ou abra o link.
                </p>
                <p className="text-caption text-muted">
                  Este link expira em{" "}
                  <span className="font-medium tabular-nums text-ink">
                    {formatKycCountdown(kycMsRemaining(state.expiresAt, now))}
                  </span>
                  . Depois disso você gera outro aqui.
                </p>
              </>
            )}

            {state.kind === "expired" && (
              <p className="text-caption text-muted">
                {canReissue
                  ? "O link da verificação expirou. Gere um novo e conclua em até 20 minutos."
                  : "O link da verificação expirou. Peça ao responsável pela conta para gerar um novo."}
              </p>
            )}

            {state.kind === "preparing" && (
              <p className="text-caption text-muted">
                Falta a verificação de identidade do responsável pela conta para liberar seus
                repasses. Estamos preparando o link, atualize a página em alguns minutos.
              </p>
            )}
          </div>
        </div>

        {state.kind === "ready" && (
          <div>
            <Button asChild size="sm">
              <a href={state.url} target="_blank" rel="noreferrer">
                Fazer prova de vida
              </a>
            </Button>
          </div>
        )}

        {state.kind === "expired" && canReissue && (
          <div>
            <Button size="sm" onClick={reissue} disabled={sync.isPending}>
              {sync.isPending ? "Gerando..." : "Gerar link novo"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
