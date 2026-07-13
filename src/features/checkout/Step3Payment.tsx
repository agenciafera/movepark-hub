import * as React from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, CreditCard, Hourglass, Smartphone } from "lucide-react";
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
  useCreateCardCharge,
  useCreatePixCharge,
  usePaymentConfig,
  useUpdateBookingCustomer,
} from "./api";
import { toSvgString } from "@/lib/qr";
import { formatBRL } from "@/lib/format";
import { computeInstallmentPlan } from "@/lib/installments";
import { tokenizeCard } from "@/lib/pagarme-tokenize";
import { documentMask, onlyDigits } from "@/lib/masks";
import { isValidCnpj, isValidCpf } from "@/lib/documents";
import { useAuth } from "@/auth/context";
import { useProfile, useUpdateProfile } from "@/features/profile/api";
import { useMyPaymentMethods } from "@/features/payment-methods/api";

type Props = {
  bookingId: string;
  bookingCode: string;
  totalAmount: number;
  /** CPF/CNPJ já no snapshot do booking (pra pré-preencher). */
  customerTaxId: string | null;
  paymentStatus: "pending" | "authorized" | "paid" | "refunded" | "failed" | "cancelled" | null;
  onBack: () => void;
};

/** "MM/AA" → { month, year } (4 dígitos) ou null. */
function parseExpiry(s: string): { month: number; year: number } | null {
  const m = s.replace(/\s/g, "").match(/^(\d{2})\/?(\d{2})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  if (month < 1 || month > 12) return null;
  return { month, year: 2000 + parseInt(m[2], 10) };
}

export function Step3Payment({
  bookingId,
  bookingCode,
  totalAmount,
  customerTaxId,
  paymentStatus,
  onBack,
}: Props) {
  const pix = useCreatePixCharge();
  const card = useCreateCardCharge();
  const config = usePaymentConfig();
  const { session } = useAuth();
  const profileQ = useProfile(session?.userId);
  const updateProfile = useUpdateProfile();
  const updateCustomer = useUpdateBookingCustomer();
  const savedCards = useMyPaymentMethods(session?.userId);

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

  // cartão: escolher salvo ou "new"
  const [cardChoice, setCardChoice] = React.useState<string>("new");
  const [cardNumber, setCardNumber] = React.useState("");
  const [cardName, setCardName] = React.useState("");
  const [cardExpiry, setCardExpiry] = React.useState("");
  const [cardCvv, setCardCvv] = React.useState("");
  const [installments, setInstallments] = React.useState(1);
  const [saveCard, setSaveCard] = React.useState(false);

  const policy = config.data?.installment_policy;
  const totalCents = Math.round(totalAmount * 100);
  const options = React.useMemo(
    () => (policy ? computeInstallmentPlan(totalCents, policy) : []),
    [policy, totalCents],
  );

  async function initPix() {
    try {
      if (!(await persistTaxId())) return;
      const res = await pix.mutateAsync({ booking_code: bookingCode });
      setPixPayload(res.qr_code);
      if (res.qr_code) setPixSvg(await toSvgString(res.qr_code, 256));
      toast.success("PIX gerado. Pague no seu app de banco.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PIX");
    }
  }

  async function payCard(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!(await persistTaxId())) return;
      if (cardChoice !== "new") {
        await card.mutateAsync({ booking_code: bookingCode, installments, payment_method_id: cardChoice });
      } else {
        const expiry = parseExpiry(cardExpiry);
        if (!expiry) {
          toast.error("Validade inválida (use MM/AA).");
          return;
        }
        const tok = await tokenizeCard(config.data!.public_key, {
          number: cardNumber,
          holder_name: cardName,
          exp_month: expiry.month,
          exp_year: expiry.year,
          cvv: cardCvv,
        });
        await card.mutateAsync({
          booking_code: bookingCode,
          installments,
          card_token: tok.token,
          save_card: saveCard,
          holder_name: cardName,
          brand: tok.brand,
          last4: tok.last4,
          exp_month: expiry.month,
          exp_year: expiry.year,
        });
      }
      toast.success("Pagamento aprovado. Confirmando…");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pagamento recusado");
    }
  }

  function copyPix() {
    if (!pixPayload) return;
    navigator.clipboard.writeText(pixPayload);
    toast.success("Código copiado");
  }

  const waitingForConfirmation = paymentStatus === "pending";
  const cardEnabled = policy?.enabled ?? false;
  const busy = card.isPending || waitingForConfirmation;

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
        <p className="text-body-md text-muted">
          PIX com confirmação automática ou cartão de crédito (parcelado).
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

      <Tabs defaultValue="pix">
        <TabsList>
          <TabsTrigger value="pix" className="inline-flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
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
                <Button onClick={initPix} disabled={pix.isPending}>
                  {pix.isPending ? "Gerando…" : "Gerar PIX"}
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
              {/* Cartão salvo ou novo */}
              {(savedCards.data ?? []).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="card-choice">Cartão</Label>
                  <Select value={cardChoice} onValueChange={setCardChoice}>
                    <SelectTrigger id="card-choice">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(savedCards.data ?? []).map((pm) => (
                        <SelectItem key={pm.id} value={pm.id}>
                          {pm.brand} •••• {pm.last4}
                        </SelectItem>
                      ))}
                      <SelectItem value="new">Usar outro cartão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {cardChoice === "new" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="card-number">Número do cartão</Label>
                    <Input
                      id="card-number"
                      inputMode="numeric"
                      placeholder="0000 0000 0000 0000"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="card-name">Nome no cartão</Label>
                    <Input
                      id="card-name"
                      placeholder="NOME SOBRENOME"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="card-expiry">Validade (MM/AA)</Label>
                      <Input
                        id="card-expiry"
                        inputMode="numeric"
                        placeholder="12/27"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="card-cvv">CVV</Label>
                      <Input
                        id="card-cvv"
                        inputMode="numeric"
                        placeholder="123"
                        maxLength={4}
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-body-sm text-body">
                    <input
                      type="checkbox"
                      checked={saveCard}
                      onChange={(e) => setSaveCard(e.target.checked)}
                      className="h-4 w-4 rounded border-hairline accent-mp-indigo"
                    />
                    Salvar este cartão para as próximas reservas
                  </label>
                </>
              )}

              {/* Parcelas */}
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
                    {options.map((o) => (
                      <SelectItem key={o.installments} value={String(o.installments)}>
                        {o.installments}x de {formatBRL(o.installmentCents / 100)}
                        {o.hasInterest
                          ? ` (com juros, total ${formatBRL(o.totalCents / 100)})`
                          : " sem juros"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {card.isPending ? "Processando…" : waitingForConfirmation ? "Confirmando…" : "Pagar com cartão"}
              </Button>
            </form>
          )}
        </TabsContent>
      </Tabs>

    </div>
  );
}
