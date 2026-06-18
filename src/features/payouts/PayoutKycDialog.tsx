import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePayoutAccount, useSavePayoutAccountAdmin } from "./api";
import { PayoutKycForm } from "./PayoutKycForm";
import { payoutAccountToForm, toPayoutAccountPayload, type PayoutKycForm as KycValues } from "./kyc";

type Props = {
  companyId: string;
  companyName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Diálogo do Manager (hub_admin) para editar os dados de recebimento (KYC) de um parceiro. */
export function PayoutKycDialog({ companyId, companyName, open, onOpenChange }: Props) {
  const { data: account, isLoading } = usePayoutAccount(open ? companyId : undefined);
  const save = useSavePayoutAccountAdmin();

  async function submit(values: KycValues) {
    try {
      await save.mutateAsync({ company_id: companyId, payload: toPayoutAccountPayload(values) });
      toast.success("Dados de recebimento salvos.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dados de recebimento (KYC)</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-10 text-center text-muted">Carregando…</div>
        ) : (
          <PayoutKycForm
            defaultValues={payoutAccountToForm(account ?? null, { legalName: companyName })}
            onSubmit={submit}
            submitting={save.isPending}
            submitLabel="Salvar"
            onSkip={() => onOpenChange(false)}
            skipLabel="Cancelar"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
