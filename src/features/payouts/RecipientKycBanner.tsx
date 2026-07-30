import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toDataUrl } from "@/lib/qr";
import { useRecipient } from "./api";
import { resolveKycBannerState } from "./RecipientKycBanner.logic";

/**
 * Banner para o PARCEIRO: aparece quando o recebedor precisa de prova de vida (KYC).
 *
 * Dois estados. Com link, mostra o QR code e o botão; sem link (o gateway já exigiu a verificação
 * mas o link ainda não chegou), avisa que está sendo preparado. Antes disso o parceiro não via
 * nada nesse intervalo e ficava parado sem saber que precisava agir.
 *
 * O link do gateway expira em 20 minutos, então a validade é dita na tela: um link guardado é
 * quase sempre um link vencido quando o parceiro abre o painel.
 */
export function RecipientKycBanner({ companyId }: { companyId: string | undefined }) {
  const { data: recipient } = useRecipient(companyId);
  const state = resolveKycBannerState(recipient);
  const kycUrl = state.kind === "ready" ? state.url : null;

  const { data: qr } = useQuery({
    queryKey: ["kyc-qr", kycUrl],
    queryFn: () => toDataUrl(kycUrl!, 160),
    enabled: !!kycUrl,
  });

  if (state.kind === "hidden") return null;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-badge-pending-fg/30 bg-badge-pending-bg p-4 tablet:flex-row tablet:items-center">
      {qr && (
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
            {state.kind === "ready" ? (
              <>
                <p className="text-caption text-muted">
                  Falta a verificação de identidade para liberar seus repasses. Escaneie o QR code
                  com o celular ou abra o link.
                </p>
                <p className="text-caption text-muted">
                  O link vale 20 minutos. Se expirar, atualize a página daqui a alguns minutos e um
                  novo aparece aqui.
                </p>
              </>
            ) : (
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
      </div>
    </div>
  );
}
