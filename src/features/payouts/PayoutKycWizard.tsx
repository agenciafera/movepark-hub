import * as React from "react";
import { useForm, FormProvider, type Control, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { SubStepBar } from "@/components/shared/SubStepBar";
import { payoutKycSchema, type PayoutKycForm as KycValues } from "./kyc";
import {
  KycCompanySection,
  KycCompanyAddressSection,
  KycRepresentativeSection,
  KycRepAddressSection,
  KycBankSection,
} from "./PayoutKycForm";

type KycStep = {
  title: string;
  /** Prefixos de campo validados antes de avançar (o zod cobre os aninhados: company.address, etc.). */
  fields: Path<KycValues>[];
  render: (control: Control<KycValues>) => React.ReactNode;
};

// Quebrado em etapas curtas: o formulário completo era grande demais pra preencher de uma vez.
// Cada etapa valida só os seus campos antes de avançar.
const STEPS: KycStep[] = [
  {
    title: "Empresa",
    fields: [
      "company.legal_name",
      "company.trade_name",
      "company.document",
      "company.corporation_type",
      "company.email",
      "company.phone",
      "company.annual_revenue",
      "company.founding_date",
    ],
    render: (c) => <KycCompanySection control={c} />,
  },
  {
    title: "Endereço da empresa",
    fields: ["company.address"],
    render: (c) => <KycCompanyAddressSection control={c} />,
  },
  {
    title: "Representante",
    fields: ["representative"],
    render: (c) => (
      <div className="flex flex-col gap-7">
        <KycRepresentativeSection control={c} />
        <KycRepAddressSection control={c} />
      </div>
    ),
  },
  {
    title: "Conta bancária",
    fields: ["bank"],
    render: (c) => <KycBankSection control={c} />,
  },
];

export type PayoutKycWizardProps = {
  defaultValues: KycValues;
  onSubmit: (values: KycValues) => Promise<void> | void;
  submitting?: boolean;
  onSkip?: () => void;
};

/**
 * KYC do recebedor em ETAPAS (operador), no padrão do PublishWizard da fase 1: barra de progresso,
 * "Passo X de N", Continuar/Voltar com validação por etapa. Um único form (react-hook-form); só
 * submete na última etapa. Reusa as seções do PayoutKycForm.
 */
export function PayoutKycWizard({ defaultValues, onSubmit, submitting, onSkip }: PayoutKycWizardProps) {
  const methods = useForm<KycValues>({
    resolver: zodResolver(payoutKycSchema),
    defaultValues,
    mode: "onBlur",
  });
  const {
    control,
    handleSubmit,
    trigger,
    formState: { isSubmitting },
  } = methods;

  const [step, setStep] = React.useState(0);
  const busy = submitting || isSubmitting;
  const isLast = step === STEPS.length - 1;

  async function next() {
    const ok = await trigger(STEPS[step].fields);
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit((v) => onSubmit(v))} className="flex flex-col gap-6">
      {/* seções da fase Recebimento (por nome; o estágio macro fica na trilha do topo) */}
      <SubStepBar steps={STEPS.map((s) => s.title)} current={step} />

      {/* re-anima a cada avanço de etapa pra dar a sensação de progresso */}
      <div key={step} className="duration-300 animate-in fade-in slide-in-from-right-2">
        {STEPS[step].render(control)}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-hairline pt-5">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        ) : onSkip ? (
          <Button type="button" variant="ghost" onClick={onSkip} disabled={busy}>
            Fazer depois
          </Button>
        ) : (
          <span />
        )}
        {isLast ? (
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar e continuar"} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" onClick={next} disabled={busy}>
            Continuar <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
      </form>
    </FormProvider>
  );
}
