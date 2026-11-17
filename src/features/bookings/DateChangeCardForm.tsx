import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CardBrandMark } from "@/components/shared/CardBrandMark";
import { useAuth } from "@/auth/context";
import { useCreateCardCharge, usePaymentConfig } from "@/features/checkout/api";
import {
  addressPartsFrom,
  buildBillingAddress,
  formatCep,
  normalizeCep,
  parseViaCep,
  viaCepUrl,
} from "@/features/checkout/billingAddress.logic";
import { describeInstallmentOption, summarizeInstallmentOption } from "@/features/checkout/installments.logic";
import { antifraudOutcome } from "@/features/checkout/checkoutTrail";
import { useMyPaymentMethods } from "@/features/payment-methods/api";
import { useProfile, useUpdateProfile } from "@/features/profile/api";
import { applyInstallmentOverride, computeInstallmentPlan } from "@/lib/installments";
import { tokenizeCard } from "@/lib/pagarme-tokenize";
import { parseValidade } from "@/lib/card-expiry";
import { cardExpiryMask, cardNumberMask, onlyDigits } from "@/lib/masks";
import { brandLabel, detectBrand, isCvvValid } from "@/lib/card-brand";
import { formatBRL } from "@/lib/format";

type Props = {
  bookingCode: string;
  /** A diferença cotada (centavos): é sobre ela que o parcelamento é calculado. */
  amountCents: number;
  checkInAt: string;
  checkOutAt: string;
  /** Parcelamento congelado na reserva (regra de repasse > empresa). */
  installmentsMax?: number | null;
  installmentsInterestFree?: number | null;
  /** `applied`: aprovado na hora e as datas já mudaram; senão, o cartão ficou em análise. */
  onPaid: (applied: boolean) => void;
  /** Antifraude recusou: a diferença segue pelo PIX. */
  onUsePix: () => void;
};

/**
 * Cartão para a diferença de uma troca de datas de reserva paga (17/11/2026). Vai pela mesma Edge do
 * checkout (`create-card-charge` com `date_change`): mesmo split, antifraude, cartão salvo e regra de
 * parcelas, com os mesmos rótulos para o cliente reconhecer a tela. O servidor confere de novo a
 * diferença e recusa se ela mudou desde a prévia.
 */
export function DateChangeCardForm({
  bookingCode,
  amountCents,
  checkInAt,
  checkOutAt,
  installmentsMax,
  installmentsInterestFree,
  onPaid,
  onUsePix,
}: Props) {
  const { session } = useAuth();
  const config = usePaymentConfig();
  const card = useCreateCardCharge();
  const savedCards = useMyPaymentMethods(session?.userId);
  const profileQ = useProfile(session?.userId);
  const updateProfile = useUpdateProfile();

  const [cardChoice, setCardChoice] = React.useState<string>("new");
  const escolhaInicial = React.useRef(false);
  React.useEffect(() => {
    if (escolhaInicial.current) return;
    const first = savedCards.data?.[0];
    if (!first) return;
    setCardChoice(first.id);
    escolhaInicial.current = true;
  }, [savedCards.data]);

  const [cardNumber, setCardNumber] = React.useState("");
  const [cardName, setCardName] = React.useState("");
  const [cardExpiry, setCardExpiry] = React.useState("");
  const [cardCvv, setCardCvv] = React.useState("");
  const [installments, setInstallments] = React.useState(1);
  const [antifraude, setAntifraude] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const travaEnvio = React.useRef(false);

  // Endereço de cobrança: o antifraude exige em cartão novo. Vem do perfil quando já foi salvo.
  const [cep, setCep] = React.useState("");
  const [addrNumber, setAddrNumber] = React.useState("");
  const [addrComplement, setAddrComplement] = React.useState("");
  const [addr, setAddr] = React.useState({ street: "", neighborhood: "", city: "", state: "" });
  const [cepStatus, setCepStatus] = React.useState<"idle" | "loading" | "ok" | "notfound">("idle");
  const enderecoInicial = React.useRef(false);
  React.useEffect(() => {
    if (enderecoInicial.current || !profileQ.data) return;
    const saved = addressPartsFrom(profileQ.data.preferences?.billing_address);
    if (saved) {
      setCep(formatCep(saved.cep));
      setAddrNumber(saved.number);
      setAddrComplement(saved.complement ?? "");
      setAddr({ street: saved.street, neighborhood: saved.neighborhood, city: saved.city, state: saved.state });
      setCepStatus(saved.city ? "ok" : "idle");
    }
    enderecoInicial.current = true;
  }, [profileQ.data]);
  const cepDigits = normalizeCep(cep);
  React.useEffect(() => {
    if (!cepDigits) {
      setCepStatus("idle");
      return;
    }
    let vivo = true;
    setCepStatus("loading");
    fetch(viaCepUrl(cepDigits))
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        const parsed = parseViaCep(j);
        if (!parsed) {
          setAddr({ street: "", neighborhood: "", city: "", state: "" });
          setCepStatus("notfound");
          return;
        }
        setAddr(parsed);
        setCepStatus("ok");
      })
      .catch(() => {
        if (vivo) setCepStatus("notfound");
      });
    return () => {
      vivo = false;
    };
  }, [cepDigits]);

  const platformPolicy = config.data?.installment_policy;
  const policy = React.useMemo(
    () =>
      platformPolicy
        ? applyInstallmentOverride(platformPolicy, { max: installmentsMax, interestFree: installmentsInterestFree })
        : undefined,
    [platformPolicy, installmentsMax, installmentsInterestFree],
  );
  const options = React.useMemo(
    () =>
      policy
        ? computeInstallmentPlan(amountCents, policy).map((option) => ({
            option,
            label: describeInstallmentOption(option, policy),
          }))
        : [],
    [policy, amountCents],
  );
  const chosen = options.find((o) => o.option.installments === installments) ?? options[0];

  if (config.isLoading) return <p className="text-body-sm text-muted">Carregando o pagamento…</p>;
  if (!policy?.enabled) {
    return (
      <p className="text-body-sm text-muted">
        Pagamento com cartão indisponível no momento. Use o PIX.
      </p>
    );
  }

  const dateChange = { check_in_at: checkInAt, check_out_at: checkOutAt, expected_delta_cents: amountCents };

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    if (travaEnvio.current) return;
    travaEnvio.current = true;
    setEnviando(true);
    try {
      let r;
      if (cardChoice !== "new") {
        r = await card.mutateAsync({ booking_code: bookingCode, installments, payment_method_id: cardChoice, date_change: dateChange });
      } else {
        const validade = parseValidade(cardExpiry, new Date());
        if (!validade) {
          toast.error("Validade inválida (use MM/AA).");
          return;
        }
        if (!isCvvValid(cardCvv, detectBrand(onlyDigits(cardNumber)))) {
          toast.error("Confira o CVV: são 3 dígitos no verso do cartão (4 na frente, no Amex).");
          return;
        }
        const parts = { cep, number: addrNumber, complement: addrComplement, ...addr };
        const cobranca = buildBillingAddress(parts);
        if (cobranca.error) {
          toast.error(cobranca.error);
          return;
        }
        const tok = await tokenizeCard(config.data!.public_key, {
          number: cardNumber,
          holder_name: cardName,
          exp_month: validade.mes,
          exp_year: validade.ano,
          cvv: cardCvv,
        });
        r = await card.mutateAsync({
          booking_code: bookingCode,
          installments,
          card_token: tok.token,
          holder_name: cardName,
          brand: tok.brand,
          last4: tok.last4,
          exp_month: validade.mes,
          exp_year: validade.ano,
          billing_address: cobranca.address,
          date_change: dateChange,
        });
        if (session?.userId) {
          updateProfile
            .mutateAsync({ id: session.userId, preferences: { ...(profileQ.data?.preferences ?? {}), billing_address: parts } })
            .catch(() => {});
        }
      }
      onPaid(r.applied === true);
    } catch (err) {
      if (antifraudOutcome(err)) setAntifraude(true);
      toast.error(err instanceof Error ? err.message : "Pagamento recusado");
    } finally {
      travaEnvio.current = false;
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={pagar} className="space-y-4">
      {(savedCards.data ?? []).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dc-card-choice">Cartão</Label>
          <Select value={cardChoice} onValueChange={setCardChoice}>
            <SelectTrigger id="dc-card-choice">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(savedCards.data ?? []).map((pm) => (
                <SelectItem key={pm.id} value={pm.id}>
                  <span className="inline-flex items-center gap-2">
                    <CardBrandMark brand={pm.brand} />
                    <span>
                      {brandLabel(pm.brand)} •••• {pm.last4}
                    </span>
                  </span>
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
            <Label htmlFor="dc-card-number">Número do cartão</Label>
            <Input
              id="dc-card-number"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="0000 0000 0000 0000"
              value={cardNumber}
              onChange={(e) => setCardNumber(cardNumberMask(e.target.value))}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dc-card-name">Nome no cartão</Label>
            <Input id="dc-card-name" placeholder="NOME SOBRENOME" value={cardName} onChange={(e) => setCardName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dc-card-expiry">Validade (MM/AA)</Label>
              <Input
                id="dc-card-expiry"
                inputMode="numeric"
                placeholder="12/27"
                autoComplete="cc-exp"
                maxLength={5}
                value={cardExpiry}
                onChange={(e) => setCardExpiry(cardExpiryMask(e.target.value))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dc-card-cvv">CVV</Label>
              <Input
                id="dc-card-cvv"
                inputMode="numeric"
                placeholder="123"
                maxLength={4}
                value={cardCvv}
                onChange={(e) => setCardCvv(onlyDigits(e.target.value))}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dc-card-cep">CEP do endereço do cartão</Label>
              <Input
                id="dc-card-cep"
                inputMode="numeric"
                placeholder="00000-000"
                value={cep}
                onChange={(e) => setCep(formatCep(e.target.value))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dc-card-addr-number">Número</Label>
              <Input id="dc-card-addr-number" placeholder="123" value={addrNumber} onChange={(e) => setAddrNumber(e.target.value)} required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dc-card-addr-complement">Complemento (opcional)</Label>
            <Input
              id="dc-card-addr-complement"
              placeholder="apto, bloco, sala"
              value={addrComplement}
              onChange={(e) => setAddrComplement(e.target.value)}
            />
          </div>
          {cepStatus === "loading" && <p className="text-caption text-muted">Buscando o endereço…</p>}
          {cepStatus === "notfound" && <p className="text-caption text-error">Não achamos esse CEP. Confira os dígitos.</p>}
          {cepStatus === "ok" && (
            <p className="text-caption text-muted">
              {[addr.street, addr.neighborhood].filter(Boolean).join(", ")}
              {addr.street || addr.neighborhood ? " · " : ""}
              {addr.city}/{addr.state}
            </p>
          )}
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dc-installments">Parcelas</Label>
        <Select value={String(installments)} onValueChange={(v) => setInstallments(Number(v))}>
          <SelectTrigger id="dc-installments">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(({ option, label }) => (
              <SelectItem key={option.installments} value={String(option.installments)} description={label.detalhe}>
                {label.titulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {chosen && (
          <p aria-live="polite" className="text-pretty text-caption-sm text-muted">
            {summarizeInstallmentOption(chosen.option, policy)}
          </p>
        )}
      </div>

      {antifraude && (
        <div role="alert" className="space-y-3 rounded-md border border-hairline bg-surface-soft p-4 text-body-md text-body">
          <p className="text-pretty">A análise de segurança não liberou este cartão. Pague a diferença no PIX.</p>
          <Button type="button" variant="secondary" onClick={onUsePix}>
            Pagar com PIX
          </Button>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={enviando || card.isPending}>
        {enviando || card.isPending ? "Processando…" : `Pagar ${formatBRL((chosen?.option.totalCents ?? amountCents) / 100)} no cartão`}
      </Button>
    </form>
  );
}
