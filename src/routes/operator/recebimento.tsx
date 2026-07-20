import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { ArrowLeft, Check, Download, Landmark, FileText, ShieldCheck, ShieldQuestion, ExternalLink, Clock } from "lucide-react";
import { useAuth } from "@/auth/context";
import { Wordmark } from "@/components/shared/Brand";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PayoutKycWizard } from "@/features/payouts/PayoutKycWizard";
import { payoutAccountToForm, toPayoutAccountPayload, type PayoutKycForm as KycValues } from "@/features/payouts/kyc";
import {
  usePayoutAccount,
  useSavePayoutAccountSelf,
  useContractStatus,
  useAcceptContract,
  useSyncRecipient,
} from "@/features/payouts/api";
import { CONTRACT_VERSION, CONTRACT_SUMMARY, downloadContract } from "@/features/payouts/contract";
import { RevenueMotivator, RevenueMotivatorBanner } from "@/features/payouts/RevenueMotivator";
import { OnboardingJourney } from "@/components/shared/OnboardingJourney";
import { ConfettiBurst } from "@/components/shared/ConfettiBurst";

type Step = "dados" | "contrato" | "done";

/**
 * Recebimento self-service do operador (E1.3) — a "etapa 2" que a tela pós-publicação (unit-preview)
 * empurra. Coleta dados bancários + empresa (CNPJ) via PayoutKycForm e fecha com a assinatura do
 * contrato (simulada por ora). Quando a Movepark aprova o recebedor, a unidade entra na busca
 * (gate is_listed). Standalone, no estilo do preview travado.
 */
/** Comemoração no aside ao completar o cadastro: emoji pulando + confete em loop. */
function SetupDoneAside() {
  return (
    <div className="relative flex flex-col items-center gap-4 overflow-hidden rounded-lg bg-brand-gradient p-6 text-center text-white">
      <ConfettiBurst loop count={22} />
      <style>{`@keyframes mp-party{0%,100%{transform:translateY(0) rotate(0) scale(1)}18%{transform:translateY(-12px) rotate(-14deg) scale(1.18)}40%{transform:translateY(0) rotate(12deg) scale(1.08)}62%{transform:translateY(-6px) rotate(-7deg) scale(1.05)}82%{transform:translateY(0) rotate(6deg) scale(1.02)}}`}</style>
      <span
        className="relative select-none text-6xl leading-none"
        style={{ animation: "mp-party 1.4s ease-in-out infinite" }}
      >
        🎉
      </span>
      <div className="relative flex flex-col gap-1.5">
        <p className="text-title-lg text-white">Mandou muito bem! 🥳</p>
        <p className="text-body-sm text-white/90">
          Fez tudo do seu lado. Agora relaxa e deixa o resto com a gente.
        </p>
      </div>
    </div>
  );
}

export default function OperatorRecebimento() {
  const navigate = useNavigate();
  const { effectiveCompanyIds } = useAuth();
  const companyId = effectiveCompanyIds[0];

  const account = usePayoutAccount(companyId);
  const contract = useContractStatus(companyId);
  const saveAccount = useSavePayoutAccountSelf();
  const acceptContract = useAcceptContract();
  const syncRecipient = useSyncRecipient();
  const [accept, setAccept] = React.useState(false);
  // resultado da criação do recebedor na Pagar.me (status + link de KYC, se houver).
  const [recipient, setRecipient] = React.useState<{ status: string; kycUrl: string | null } | null>(null);

  const hasAccount = !!account.data;
  const hasContract = !!contract.data?.acceptedAt;

  // Passo atual: dados → contrato → done. Deriva do que já foi feito, com override local ao avançar.
  const [override, setOverride] = React.useState<Step | null>(null);
  const derived: Step = !hasAccount ? "dados" : !hasContract ? "contrato" : "done";
  const step = override ?? derived;

  async function submitAccount(values: KycValues) {
    if (!companyId) return;
    try {
      await saveAccount.mutateAsync({ company_id: companyId, payload: toPayoutAccountPayload(values) });
      toast.success("Dados de recebimento salvos.");
      setOverride("contrato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  }

  async function signContract() {
    if (!companyId || !accept) return;
    try {
      await acceptContract.mutateAsync({ company_id: companyId, version: CONTRACT_VERSION });
      // Assinado → cria o recebedor na Pagar.me. Se o gateway pedir verificação, ele devolve o
      // link de KYC, que vira o próximo passo. Falha aqui não trava a conclusão (a Movepark recria).
      try {
        const r = await syncRecipient.mutateAsync({ company_id: companyId, action: "create" });
        setRecipient({ status: r.status, kycUrl: r.kyc_url });
      } catch {
        setRecipient(null);
      }
      toast.success("Contrato assinado.");
      setOverride("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível assinar.");
    }
  }

  const loading = account.isLoading || contract.isLoading;

  return (
    <div className="min-h-screen bg-surface-soft">
      <Helmet>
        <title>Dados de recebimento | Movepark</title>
      </Helmet>
      <div className="mx-auto grid max-w-[1080px] gap-8 px-4 py-8 tablet:py-12 desktop:grid-cols-[1fr_360px] desktop:px-8">
        <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Wordmark height={24} />
          <Button asChild variant="ghost" size="sm">
            <Link to="/operator">
              <ArrowLeft className="h-4 w-4" /> Ir para o painel
            </Link>
          </Button>
        </div>

        {!loading && (
          <OnboardingJourney
            current={step === "done" ? "vender" : "recebimento"}
            completed={step === "done" ? ["preview", "recebimento"] : ["preview"]}
            estimate={step === "done" ? undefined : "5 minutos"}
          />
        )}

        {step !== "done" && (
          <div className="desktop:hidden">
            <RevenueMotivatorBanner />
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-muted">Carregando…</div>
        ) : step === "dados" ? (
          <div className="flex flex-col gap-5 rounded-lg border border-hairline bg-canvas p-6 shadow-tier tablet:p-8">
            <div className="space-y-1">
              <h1 className="text-display-sm text-ink">Seus dados de recebimento</h1>
              <p className="text-body-sm text-muted">
                É com esses dados que a Movepark repassa o dinheiro das suas reservas. Assim que a
                gente aprovar, sua unidade entra na busca e começa a vender.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-caption-sm text-muted-steel">
              <span className="flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5" /> Conta bancária
              </span>
              <span className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> CNPJ e dados da empresa
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Verificação (KYC)
              </span>
            </div>
            <PayoutKycWizard
              defaultValues={payoutAccountToForm(account.data ?? null, {})}
              onSubmit={submitAccount}
              submitting={saveAccount.isPending}
              onSkip={() => navigate("/operator")}
            />
          </div>
        ) : step === "contrato" ? (
          <div className="flex flex-col gap-5 rounded-lg border border-hairline bg-canvas p-6 shadow-tier tablet:p-8">
            <div className="space-y-1">
              <h1 className="text-display-sm text-ink">Contrato de parceria</h1>
              <p className="text-body-sm text-muted">
                Último passo: leia e assine o contrato com a Movepark. É rápido.
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border border-hairline bg-surface-soft p-4 text-body-sm text-ink">
              <p className="font-medium text-ink">Resumo do contrato de parceria (versão {CONTRACT_VERSION})</p>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-muted">
                {CONTRACT_SUMMARY.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-3 text-caption-sm text-muted-steel">
                Este é um resumo. Baixe o contrato completo para ler e guardar.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="w-fit"
              onClick={() =>
                downloadContract({
                  companyName: account.data?.legal_name,
                  acceptedAt: contract.data?.acceptedAt,
                })
              }
            >
              <Download className="h-4 w-4" /> Baixar contrato
            </Button>
            <label className="flex items-start gap-2.5 text-body-sm text-ink">
              <Checkbox checked={accept} onCheckedChange={(v) => setAccept(v === true)} className="mt-0.5" />
              <span>Li e concordo com o contrato de parceria da Movepark.</span>
            </label>
            <div className="flex items-center gap-2">
              <Button
                onClick={signContract}
                disabled={!accept || acceptContract.isPending || syncRecipient.isPending}
              >
                {acceptContract.isPending || syncRecipient.isPending
                  ? "Assinando…"
                  : "Assinar contrato"}
              </Button>
              <Button variant="ghost" onClick={() => setOverride("dados")}>
                Voltar aos dados
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="relative flex flex-col items-start gap-3 overflow-hidden rounded-lg border border-success/30 bg-success/5 p-6 duration-500 animate-in fade-in zoom-in-95">
              <ConfettiBurst />
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success/15">
                <Check className="h-6 w-6 text-success" />
              </div>
              <h1 className="text-title-lg text-ink">Fechou! Cadastro completo 🎉</h1>
              <p className="text-body-sm text-muted">
                Seus dados chegaram, o contrato tá assinado e seu recebedor já foi criado. Você fez
                tudo certinho.
              </p>
            </div>

            {recipient?.kycUrl ? (
              <div className="flex flex-col gap-3 rounded-lg border border-mp-primary/30 bg-mp-pale p-5 tablet:p-6">
                <div className="flex items-center gap-2 text-mp-indigo">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="text-caption-sm font-semibold">Próximo passo</span>
                </div>
                <h2 className="text-title-md text-ink">Confirme sua identidade (verificação)</h2>
                <p className="text-body-sm text-muted">
                  Pra liberar os repasses das suas reservas, a processadora de pagamento precisa
                  confirmar quem você é. É rápido, num link seguro, e você faz uma vez só.
                </p>
                <Button asChild className="w-fit">
                  <a href={recipient.kycUrl} target="_blank" rel="noreferrer">
                    Fazer a verificação <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <details className="group text-body-sm">
                  <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-mp-indigo">
                    <ShieldQuestion className="h-4 w-4" /> Entenda o que é isso
                  </summary>
                  <p className="mt-2 text-caption-sm text-muted">
                    Essa verificação (chamada de KYC) é uma exigência das regras de pagamento no
                    Brasil. A empresa que processa os pagamentos confirma sua identidade para evitar
                    fraude e liberar o dinheiro das suas reservas na conta que você cadastrou. Você
                    envia um documento e uma selfie por um link seguro, uma única vez. Sem isso, os
                    repasses ficam retidos.
                  </p>
                </details>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-hairline bg-canvas p-5">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-mp-indigo" />
                <div>
                  <p className="text-body-sm font-medium text-ink">
                    Agora é a nossa vez: a aprovação leva uns 15 a 20 dias corridos.
                  </p>
                  <p className="mt-1 text-body-sm text-muted">
                    Pode relaxar que a gente cuida daqui. Assim que aprovar, sua unidade entra na
                    busca e começa a receber reserva. A gente te chama no e-mail e no WhatsApp.
                  </p>
                </div>
              </div>
            )}

            <Button asChild variant="ghost" className="w-fit">
              <Link to="/operator">Ir para o painel</Link>
            </Button>
          </div>
        )}
        </div>

        {!loading && (
          <aside className="hidden desktop:block">
            <div className="sticky top-8">
              {step === "done" ? <SetupDoneAside /> : <RevenueMotivator />}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

