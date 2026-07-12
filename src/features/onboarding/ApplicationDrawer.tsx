import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePartnerAction } from "./managerApi";
import { onboardingStatusLabel, onboardingStatusTone } from "./status";
import { RecipientPanel } from "@/features/payouts/RecipientPanel";
import type { PartnerApplication } from "@/types/domain";

type Props = {
  application: PartnerApplication | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReject: (app: PartnerApplication) => void;
};

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption text-muted-steel">{label}</span>
      <span className="text-body-sm text-ink">{value === null || value === undefined || value === "" ? "—" : value}</span>
    </div>
  );
}

export function ApplicationDrawer({ application, open, onOpenChange, onReject }: Props) {
  const action = usePartnerAction();
  if (!application) return null;

  const status = application.company?.onboarding_status ?? "pending_review";
  const canApprove = status === "pending_review" || status === "rejected";
  const canResend = status === "approved" || status === "in_progress";

  async function approve() {
    try {
      await action.mutateAsync({ company_id: application!.company_id, action: "approve" });
      toast.success("Parceiro aprovado. Convite enviado.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aprovar");
    }
  }

  async function resend() {
    try {
      await action.mutateAsync({ company_id: application!.company_id, action: "resend_invite" });
      toast.success("Convite reenviado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao reenviar");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {application.company?.name ?? "Cadastro"}
            <Badge tone={onboardingStatusTone[status]}>{onboardingStatusLabel[status]}</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Field label="Responsável" value={application.contact_name} />
            <Field label="Cargo" value={application.contact_role} />
            <Field label="E-mail" value={application.contact_email} />
            <Field label="Telefone" value={application.contact_phone} />
            <Field label="Cidade" value={application.city} />
            <Field label="Estado" value={application.state} />
            <Field label="Vagas (est.)" value={application.estimated_spots} />
            <Field label="Slug" value={application.company?.slug} />
            <Field label="Canal (UTM)" value={application.utm_source} />
            <Field label="Campanha" value={application.utm_campaign} />
          </div>

          {application.message && (
            <div className="flex flex-col gap-0.5">
              <span className="text-caption text-muted-steel">Mensagem</span>
              <p className="text-body-sm text-ink">{application.message}</p>
            </div>
          )}

          {application.rejection_reason && (
            <div className="rounded-sm bg-surface-soft p-3">
              <span className="text-caption text-muted-steel">Motivo da recusa</span>
              <p className="text-body-sm text-ink">{application.rejection_reason}</p>
            </div>
          )}

          {(status === "approved" || status === "in_progress" || status === "active") && (
            <RecipientPanel
              companyId={application.company_id}
              companyName={application.company?.name}
            />
          )}

          <div className="flex flex-wrap gap-2 border-t border-hairline pt-5">
            {canApprove && (
              <Button size="sm" onClick={approve} disabled={action.isPending}>
                Aprovar e enviar convite
              </Button>
            )}
            {canResend && (
              <Button size="sm" variant="secondary" onClick={resend} disabled={action.isPending}>
                Reenviar convite
              </Button>
            )}
            {status !== "rejected" && status !== "active" && (
              <Button size="sm" variant="danger" onClick={() => onReject(application)} disabled={action.isPending}>
                Recusar
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
