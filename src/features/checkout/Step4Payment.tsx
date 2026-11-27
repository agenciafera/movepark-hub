import * as React from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, CreditCard, DeviceMobile, Hourglass } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type CardChargeResponse,
  useCheckoutBooking,
  useCreateCardCharge,
  useCreatePixCharge,
  usePaymentConfig,
  useUpdateBookingCustomer,
} from "./api";
import { toSvgString } from "@/lib/qr";
import { applyInstallmentOverride, computeInstallmentPlan } from "@/lib/installments";
import {
  describeInstallmentOption,
  paymentMethodsLine,
  summarizeInstallmentOption,
} from "@/features/checkout/installments.logic";
import {
  antifraudOutcome,
  cardFailureEvent,
  logCheckoutEvent,
  type CardFailureStage,
} from "./checkoutTrail";
import { trackEcommerce } from "@/lib/analytics";
import { partnerFromBooking, paymentEcommerce, type PaymentType } from "@/lib/analytics-ecommerce";
import { documentMask, onlyDigits } from "@/lib/masks";
import { detectBrand } from "@/lib/card-brand";
import { isValidCnpj, isValidCpf } from "@/lib/documents";
import { useAuth } from "@/auth/context";
import { useProfile, useUpdateProfile } from "@/features/profile/api";
import { CardEntryFields } from "./CardEntry";
import { useCardEntry } from "./useCardEntry";
import { useQueryClient } from "@tanstack/react-query";
import { useAcceptTerms } from "@/features/legal/api";
import { LegalDocumentModal } from "@/features/legal/LegalDocumentModal";

type Props = {
  bookingId: string;
  bookingCode: string;
  totalAmount: number;
  /** CPF/CNPJ já no snapshot do booking (pra pré-preencher). */
  customerTaxId: string | null;
  /**
   * Termos já aceitos nesta reserva. Quem vem pelo link do agente pula o passo 1, onde o aceite
   * acontece; aí o clickwrap aparece aqui, colado ao pagamento, e é gravado antes da cobrança.
   * `undefined` enquanto carrega conta como não aceito: gravar de novo é inofensivo, cobrar sem
   * aceite não (as Edges de cobrança recusam com 422).
   */
  termsAccepted?: boolean;
  paymentStatus: "pending" | "authorized" | "paid" | "refunded" | "failed" | "cancelled" | null;
  /** Meio do último pagamento (`card`/`pix`): o aviso de "confirmando" é do cartão. */
  paymentMethod?: string | null;
  onBack: () => void;
};

/**
 * Cartão esperando resposta da operadora (em análise, ou sem resposta do gateway como na noite de
 * 25/11/2026). O cliente não pode achar que falhou e pagar de novo.
 */
export const CARD_CONFIRMING_NOTE =
  "Estamos confirmando o pagamento com a operadora do cartão. Não pague de novo: quando confirmar, o voucher chega no seu e-mail.";

export function Step4Payment({
  bookingId,
  bookingCode,
  totalAmount,
  customerTaxId,
  termsAccepted,
  paymentStatus,
  paymentMethod,
  onBack,
}: Props) {
  const qc = useQueryClient();
  const acceptTerms = useAcceptTerms();
  const [termsOpen, setTermsOpen] = React.useState(false);
  const precisaAceite = termsAccepted !== true;

  /** Grava o aceite dos Termos antes de cobrar, quando ele ainda não existe. */
  async function garantirAceite(): Promise<void> {
    if (!precisaAceite) return;
    await acceptTerms.mutateAsync({ booking_code: bookingCode });
    await qc.invalidateQueries({ queryKey: ["terms-accepted", bookingId] });
  }
  const pix = useCreatePixCharge();
  const card = useCreateCardCharge();
  const config = usePaymentConfig();
  const { session } = useAuth();
  // A reserva inteira, do cache da página (mesma key): é o que o `add_payment_info` carrega.
  const { data: bookingForTracking } = useCheckoutBooking(bookingCode);
  /** GA4 `add_payment_info`: o cliente escolheu o meio e mandou pagar. */
  function trackPayment(paymentType: PaymentType, parcelas?: number) {
    if (!bookingForTracking) return;
    trackEcommerce("add_payment_info", paymentEcommerce(bookingForTracking, paymentType, parcelas), {
      user_id: session?.userId,
      partner: partnerFromBooking(bookingForTracking),
    });
  }
  const profileQ = useProfile(session?.userId);
  const updateProfile = useUpdateProfile();
  const updateCustomer = useUpdateBookingCustomer();
  // O cartão (salvo ou novo, endereço, salvar para a próxima) é o mesmo da troca de datas e do upgrade.
  const entry = useCardEntry(session?.userId);

  const [pixPayload, setPixPayload] = React.useState<string | null>(null);
  const [pixSvg, setPixSvg] = React.useState<string | null>(null);

  // CPF/CNPJ do pagador: exigido pelo PIX/cartão. Pré-preenche do snapshot do booking ou do perfil;
  // editável (pode faturar em outro documento). O valor confirmado vai pro booking (fonte do pagamento).
  const [taxId, setTaxId] = React.useState("");
  const taxInit = React.useRef(false);
  React.useEffect(() => {
    if (taxInit.current) return;
    const seed = customerTaxId ?? profileQ.data?.tax_id ?? "";
    if (customerTaxId !== null || profileQ.data) {
      setTaxId(documentMask(seed));
      taxInit.current = true;
    }
  }, [customerTaxId, profileQ.data]);

  /** Valida e persiste o documento no booking (e no perfil, se estava vazio). false = inválido. */
  async function persistTaxId(): Promise<boolean> {
    const digits = onlyDigits(taxId);
    if (!isValidCpf(taxId) && !isValidCnpj(taxId)) {
      toast.error("Informe um CPF ou CNPJ válido para a cobrança.");
      return false;
    }
    if (digits !== onlyDigits(customerTaxId ?? "")) {
      await updateCustomer.mutateAsync({ bookingId, customer_tax_id: digits });
    }
    if (session && !profileQ.data?.tax_id) {
      await updateProfile.mutateAsync({ id: session.userId, tax_id: digits });
    }
    return true;
  }

  const [installments, setInstallments] = React.useState(1);

  // A política da plataforma com o parcelamento da reserva por cima (regra de repasse > padrão da
  // empresa, 09/11/2026). É o mesmo cálculo da Edge de cobrança: o que aparece aqui é o que ela aceita.
  const platformPolicy = config.data?.installment_policy;
  const policy = React.useMemo(
    () =>
      platformPolicy
        ? applyInstallmentOverride(platformPolicy, {
            max: bookingForTracking?.commission_installments_max,
            interestFree: bookingForTracking?.commission_installments_interest_free,
          })
        : undefined,
    [platformPolicy, bookingForTracking?.commission_installments_max, bookingForTracking?.commission_installments_interest_free],
  );
  const totalCents = Math.round(totalAmount * 100);
  const options = React.useMemo(
    () =>
      policy
        ? computeInstallmentPlan(totalCents, policy).map((option) => ({
            option,
            label: describeInstallmentOption(option, policy),
          }))
        : [],
    [policy, totalCents],
  );
  const chosen = options.find((o) => o.option.installments === installments) ?? options[0];

  // Trava de envio (MP-07DAE9, 17/10/2026): o botão só ficava desabilitado quando a cobrança
  // começava, e antes dela vêm CPF, aceite e tokenização (alguns segundos). Dois cliques nessa
  // janela viraram duas cobranças. A ref barra o segundo clique na hora; o estado desabilita o botão.
  const enviando = React.useRef(false);
  const [paying, setPaying] = React.useState(false);
  const [tab, setTab] = React.useState("pix");
  // Recusa do antifraude: a tela passa a oferecer o PIX (retentar o mesmo cartão só piora).
  const [antifraude, setAntifraude] = React.useState<"reproved" | "limit" | null>(null);
  function comecaEnvio(): boolean {
    if (enviando.current) return false;
    enviando.current = true;
    setPaying(true);
    return true;
  }
  function terminaEnvio() {
    enviando.current = false;
    setPaying(false);
  }

  async function initPix() {
    if (!comecaEnvio()) return;
    try {
      if (!(await persistTaxId())) return;
      await garantirAceite();
      const res = await pix.mutateAsync({ booking_code: bookingCode });
      trackPayment("pix");
      setPixPayload(res.qr_code);
      if (res.qr_code) setPixSvg(await toSvgString(res.qr_code, 256));
      toast.success("PIX gerado. Pague no seu app de banco.");
    } catch (err) {
      logCheckoutEvent(bookingCode, "client:pix_failed", null, {
        message: err instanceof Error ? err.message.slice(0, 300) : "erro",
      });
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PIX");
    } finally {
      terminaEnvio();
    }
  }

  async function payCard(e: React.FormEvent) {
    e.preventDefault();
    if (!comecaEnvio()) return;
    // Rastro do checkout: cada tentativa e onde ela morreu vão para a reserva no Manager.
    const savedCard = entry.isSaved;
    const ctx = {
      saved_card: savedCard,
      installments,
      brand: savedCard ? null : detectBrand(onlyDigits(entry.cardNumber)),
    };
    let stage: CardFailureStage = "validation";
    logCheckoutEvent(bookingCode, "client:card_attempt", null, ctx);
    const falhaLocal = (message: string) => {
      logCheckoutEvent(bookingCode, "client:card_validation", null, { ...ctx, message });
      toast.error(message);
    };
    try {
      if (!(await persistTaxId())) {
        logCheckoutEvent(bookingCode, "client:card_validation", null, { ...ctx, message: "documento" });
        return;
      }
      await garantirAceite();
      trackPayment("card", installments);
      let res: CardChargeResponse;
      if (savedCard) {
        stage = "charge";
        res = await card.mutateAsync({ booking_code: bookingCode, installments, payment_method_id: entry.cardChoice });
      } else {
        // Validade, CVV e endereço antes de tokenizar: sem endereço o antifraude recusa, e o token é
        // de uso único.
        const conferido = entry.validateNew();
        if ("error" in conferido) {
          falhaLocal(conferido.error);
          return;
        }
        stage = "tokenize";
        const cartao = await entry.tokenizeNew(config.data!.public_key, conferido);
        stage = "charge";
        res = await card.mutateAsync({ booking_code: bookingCode, installments, ...cartao });
        entry.rememberAddress(conferido.parts);
      }
      if (res.status === "unconfirmed") {
        // O gateway não respondeu e o cartão pode ter sido cobrado (MP-F00991): nada de "tente de
        // novo". A reserva fica esperando o aviso, e o checkout mostra o "confirmando". O rastro
        // (`charge_unconfirmed`) já foi gravado pela Edge.
        toast.warning(res.message ?? CARD_CONFIRMING_NOTE, { duration: 15000 });
        await qc.invalidateQueries({ queryKey: ["checkout-booking", bookingCode] });
        return;
      }
      logCheckoutEvent(bookingCode, "client:card_charge_ok", null, ctx);
      toast.success("Pagamento aprovado. Confirmando…");
    } catch (err) {
      const ev = cardFailureEvent(stage, err, ctx);
      logCheckoutEvent(bookingCode, ev.kind, ev.httpStatus, ev.detail);
      const af = antifraudOutcome(err);
      if (af) setAntifraude(af);
      toast.error(err instanceof Error ? err.message : "Pagamento recusado");
    } finally {
      terminaEnvio();
    }
  }

  function copyPix() {
    if (!pixPayload) return;
    navigator.clipboard.writeText(pixPayload);
    toast.success("Código copiado");
  }

  const waitingForConfirmation = paymentStatus === "pending";
  const cardEnabled = policy?.enabled ?? false;
  const busy = paying || card.isPending || waitingForConfirmation;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-body-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </button>

      <div className="space-y-2">
        <h2 className="text-display-sm text-ink">Pagamento</h2>
        <p className="text-body-md text-muted" data-testid="meios-de-pagamento">
          {paymentMethodsLine(policy)}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 rounded-md border border-hairline bg-canvas p-5">
        <Label htmlFor="pay-tax-id">CPF ou CNPJ</Label>
        <Input
          id="pay-tax-id"
          value={taxId}
          onChange={(e) => setTaxId(documentMask(e.target.value))}
          placeholder="CPF ou CNPJ"
          inputMode="numeric"
          maxLength={18}
          aria-describedby="pay-tax-id-help"
        />
        <span id="pay-tax-id-help" className="text-caption-sm text-muted">
          Vai na nota e é exigido pelo pagamento.
        </span>
      </div>

      {/* Clickwrap de quem pulou o passo 1 (link do agente): o mesmo aviso, colado ao pagamento.
          O aceite é gravado no clique de pagar, antes da cobrança (`garantirAceite`). */}
      {precisaAceite && (
        <p className="text-body-sm text-muted">
          Ao pagar, você aceita os{" "}
          <button
            type="button"
            onClick={() => setTermsOpen(true)}
            className="font-semibold text-ink underline hover:text-mp-primary"
          >
            Termos e Condições
          </button>
          .
        </p>
      )}
      <LegalDocumentModal
        slug="terms"
        title="Termos e Condições"
        open={termsOpen}
        onOpenChange={setTermsOpen}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pix" className="inline-flex items-center gap-2">
            <DeviceMobile className="h-4 w-4" />
            PIX
          </TabsTrigger>
          <TabsTrigger value="card" className="inline-flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Cartão
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pix">
          <div className="mt-2 rounded-md border border-hairline bg-canvas p-6">
            {!pixPayload && !waitingForConfirmation && (
              <div className="space-y-4 text-center">
                <p className="text-body-md text-body">
                  Gere o código PIX, pague no app do seu banco e a confirmação chega automaticamente.
                </p>
                <Button onClick={initPix} disabled={paying || pix.isPending}>
                  {paying || pix.isPending ? "Gerando…" : "Gerar PIX"}
                </Button>
              </div>
            )}

            {pixPayload && (
              <div className="space-y-4 text-center">
                <div className="mx-auto inline-block rounded-md border border-hairline bg-canvas p-3">
                  {pixSvg ? (
                    <div className="h-64 w-64" dangerouslySetInnerHTML={{ __html: pixSvg }} />
                  ) : (
                    <Skeleton className="h-64 w-64" />
                  )}
                </div>
                <div className="space-y-2">
                  <Button variant="secondary" size="sm" onClick={copyPix} className="mx-auto">
                    <Copy className="h-4 w-4" />
                    Copiar código PIX
                  </Button>
                  <p className="inline-flex items-center justify-center gap-2 text-caption text-muted">
                    <Hourglass className="h-3.5 w-3.5" />
                    Aguardando confirmação automática…
                  </p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="card">
          {config.isLoading ? (
            <div className="mt-2 rounded-md border border-hairline bg-canvas p-6">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : !cardEnabled ? (
            <div className="mt-2 rounded-md border border-hairline bg-canvas p-6 text-center text-body-md text-muted">
              Pagamento com cartão indisponível no momento. Use o PIX.
            </div>
          ) : (
            <form onSubmit={payCard} className="mt-2 space-y-4 rounded-md border border-hairline bg-canvas p-6">
              <CardEntryFields entry={entry} />

              {/* Parcelas. Cada opção com juros diz a taxa, o acréscimo em reais e o CET ao
                  mês e ao ano (CDC art. 52), e o resumo abaixo repete a escolhida por extenso:
                  o gatilho do seletor só mostra "Nx de R$ Y", e a informação obrigatória não
                  pode depender de abrir a lista. */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="installments">Parcelas</Label>
                <Select
                  value={String(installments)}
                  onValueChange={(v) => setInstallments(Number(v))}
                >
                  <SelectTrigger id="installments">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(({ option, label }) => (
                      <SelectItem
                        key={option.installments}
                        value={String(option.installments)}
                        description={label.detalhe}
                      >
                        {label.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {policy && chosen && (
                  <p
                    data-testid="parcelas-resumo"
                    aria-live="polite"
                    className="text-pretty text-caption-sm text-muted"
                  >
                    {summarizeInstallmentOption(chosen.option, policy)}
                  </p>
                )}
              </div>

              {antifraude && (
                <div
                  role="alert"
                  className="space-y-3 rounded-md border border-hairline bg-surface-soft p-4 text-body-md text-body"
                >
                  <p className="text-pretty">
                    A análise de segurança não liberou este cartão. No PIX a reserva confirma na hora.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setTab("pix");
                      void initPix();
                    }}
                    disabled={busy}
                  >
                    <DeviceMobile className="h-4 w-4" />
                    Pagar com PIX
                  </Button>
                </div>
              )}

              {waitingForConfirmation && paymentMethod === "card" && (
                <p role="status" className="text-pretty text-body-sm text-muted">
                  {CARD_CONFIRMING_NOTE}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={busy || antifraude === "limit"}>
                {paying || card.isPending ? "Processando…" : waitingForConfirmation ? "Confirmando…" : "Pagar com cartão"}
              </Button>
            </form>
          )}
        </TabsContent>
      </Tabs>

    </div>
  );
}
