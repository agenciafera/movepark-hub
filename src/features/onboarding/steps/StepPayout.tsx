import { toast } from "sonner";
import { PayoutKycForm } from "@/features/payouts/PayoutKycForm";
import { RecipientKycBanner } from "@/features/payouts/RecipientKycBanner";
import { usePayoutAccount } from "@/features/payouts/api";
import { payoutAccountToForm, toPayoutAccountPayload, type PayoutKycForm as KycValues } from "@/features/payouts/kyc";
import { useUpsertPayoutAccount, type OnboardingData } from "../wizardApi";

type Props = { data: OnboardingData; companyId: string; onNext: () => void; onBack: () => void };

/**
 * Passo "Recebimento" (E1.3): coleta o KYC PJ que o gateway exige para criar o recebedor e
 * repassar as vendas. Opcional para o go-live — o operador pode pular e preencher depois.
 */
export function StepPayout({ data, companyId, onNext, onBack }: Props) {
  const { data: account, isLoading } = usePayoutAccount(companyId);
  const save = useUpsertPayoutAccount(companyId);

  if (isLoading) {
    return <div className="py-10 text-center text-muted">Carregando…</div>;
  }

  const defaults = payoutAccountToForm(account ?? null, {
    legalName: data.company.legal_name ?? data.company.name,
    document: data.company.tax_id,
  });

  async function submit(values: KycValues) {
    try {
      await save.mutateAsync({ p_company_id: companyId, p_account: toPayoutAccountPayload(values) });
      toast.success("Dados de recebimento salvos.");
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-display-md text-ink">Dados para recebimento</h2>
        <p className="text-body-sm text-muted">
          Usados para criar seu recebedor no provedor de pagamentos e repassar suas vendas. Você
          pode preencher agora ou depois.
        </p>
      </div>
      <RecipientKycBanner companyId={companyId} />
      <PayoutKycForm
        defaultValues={defaults}
        onSubmit={submit}
        submitting={save.isPending}
        submitLabel="Salvar e continuar"
        onBack={onBack}
        onSkip={onNext}
      />
    </div>
  );
}
