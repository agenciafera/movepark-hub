import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PayoutRecipientStatus } from "@/types/domain";
import { useRecipient, useSyncRecipient, type PayoutRequirement } from "./api";
import { payoutStatusLabel, payoutStatusTone } from "./status";
import { PayoutKycDialog } from "./PayoutKycDialog";

/**
 * Painel do recebedor (gateway de pagamento) para o Manager. Mostra status da ficha, link de
 * verificação (KYC) e pendências, e permite criar/sincronizar o recebedor no gateway (hub_admin).
 */
export function RecipientPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName?: string | null;
}) {
  const { data: recipient, isLoading } = useRecipient(companyId);
  const sync = useSyncRecipient();
  const [kycOpen, setKycOpen] = React.useState(false);

  const status: PayoutRecipientStatus = recipient?.status ?? "draft";
  const hasExternal = !!recipient?.external_recipient_id;
  const requirements = (recipient?.requirements ?? []) as unknown as PayoutRequirement[];

  async function run(action: "create" | "refresh") {
    try {
      const res = await sync.mutateAsync({ company_id: companyId, action });
      toast.success(
        action === "create" ? "Recebedor enviado ao gateway" : "Status do recebedor atualizado",
      );
      if (res.status === "action_required") {
        toast.warning("O gateway pediu verificação — veja as pendências.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao sincronizar recebedor");
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-4">
      <div className="flex items-center justify-between">
        <span className="text-caption text-muted-steel">Recebedor (pagamento)</span>
        {!isLoading && <Badge tone={payoutStatusTone[status]}>{payoutStatusLabel[status]}</Badge>}
      </div>

      {recipient?.kyc_url && (
        <a
          href={recipient.kyc_url}
          target="_blank"
          rel="noreferrer"
          className="text-body-sm text-accent underline"
        >
          Abrir link de verificação
        </a>
      )}

      {requirements.length > 0 && (
        <div className="rounded-sm bg-surface-soft p-3">
          <span className="text-caption text-muted-steel">Pendências do gateway</span>
          <ul className="mt-1 list-inside list-disc">
            {requirements.map((r, i) => (
              <li key={`${r.code}-${i}`} className="text-body-sm text-ink">
                {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setKycOpen(true)}>
          Editar dados (KYC)
        </Button>
        {!hasExternal ? (
          <Button size="sm" onClick={() => run("create")} disabled={sync.isPending}>
            Criar recebedor
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => run("refresh")}
            disabled={sync.isPending}
          >
            Sincronizar status
          </Button>
        )}
      </div>

      <PayoutKycDialog
        companyId={companyId}
        companyName={companyName}
        open={kycOpen}
        onOpenChange={setKycOpen}
      />
    </div>
  );
}
