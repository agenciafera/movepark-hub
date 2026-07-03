import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { toDataUrl } from "@/lib/qr";
import { useRecipient } from "./api";

/**
 * Banner para o PARCEIRO: aparece quando o recebedor precisa de prova de vida (KYC) —
 * status `action_required` com link. Mostra o link e o QR code (gerado da própria URL).
 * Em staging o Pagar.me aprova sozinho, então não aparece.
 */
export function RecipientKycBanner({ companyId }: { companyId: string | undefined }) {
  const { data: recipient } = useRecipient(companyId);
  const kycUrl =
    recipient?.status === "action_required" && recipient.kyc_url ? recipient.kyc_url : null;

  const { data: qr } = useQuery({
    queryKey: ["kyc-qr", kycUrl],
    queryFn: () => toDataUrl(kycUrl!, 160),
    enabled: !!kycUrl,
  });

  if (!kycUrl) return null;

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
          <div>
            <p className="text-body-sm font-medium text-ink">Prova de vida pendente</p>
            <p className="text-caption text-muted">
              Conclua a verificação de identidade do recebedor para poder receber seus repasses.
              Escaneie o QR code ou abra o link.
            </p>
          </div>
        </div>
        <div>
          <Button asChild size="sm">
            <a href={kycUrl} target="_blank" rel="noreferrer">
              Fazer prova de vida
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
