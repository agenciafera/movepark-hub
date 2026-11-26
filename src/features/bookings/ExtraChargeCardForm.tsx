import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/auth/context";
import { useCreateCardCharge, usePaymentConfig, type CardChargeArgs } from "@/features/checkout/api";
import { CardEntryFields } from "@/features/checkout/CardEntry";
import { useCardEntry } from "@/features/checkout/useCardEntry";
import { describeInstallmentOption, summarizeInstallmentOption } from "@/features/checkout/installments.logic";
import { antifraudOutcome } from "@/features/checkout/checkoutTrail";
import { applyInstallmentOverride, computeInstallmentPlan } from "@/lib/installments";
import { formatBRL } from "@/lib/format";
import type { FareTier } from "@/lib/fares";

/** O que esta cobrança paga: a diferença de uma troca de datas ou o upgrade de tarifa. */
export type ExtraCharge =
  | { kind: "date_change"; checkInAt: string; checkOutAt: string }
  | { kind: "fare_upgrade"; targetTier: Exclude<FareTier, "basica"> };

type Props = {
  bookingCode: string;
  /** O valor cotado (centavos). O servidor confere de novo e recusa se ele mudou desde a prévia. */
  amountCents: number;
  charge: ExtraCharge;
  /** Parcelamento congelado na reserva: vale para a diferença de datas. O upgrade é sempre à vista. */
  installmentsMax?: number | null;
  installmentsInterestFree?: number | null;
  /** `applied`: aprovado na hora e a reserva já mudou; senão, o cartão ficou em análise. */
  onPaid: (applied: boolean) => void;
  /** Antifraude recusou: a cobrança segue pelo PIX. */
  onUsePix: () => void;
};

/**
 * Cartão de uma cobrança depois da compra (26/11/2026): a diferença de datas e o upgrade de tarifa.
 * Usa os mesmos campos do checkout (`CardEntryFields`), então quem paga escolhe um cartão salvo ou
 * salva o novo, como na compra. Vai pela mesma Edge (`create-card-charge`), com o mesmo antifraude.
 * O upgrade não parcela (reunião de 26/11/2026); a diferença de datas segue o parcelamento da reserva.
 */
export function ExtraChargeCardForm({
  bookingCode,
  amountCents,
  charge,
  installmentsMax,
  installmentsInterestFree,
  onPaid,
  onUsePix,
}: Props) {
  const { session } = useAuth();
  const config = usePaymentConfig();
  const card = useCreateCardCharge();
  const entry = useCardEntry(session?.userId);
  const [installments, setInstallments] = React.useState(1);
  const [antifraude, setAntifraude] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const travaEnvio = React.useRef(false);
  const parcela = charge.kind === "date_change";

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
      policy && parcela
        ? computeInstallmentPlan(amountCents, policy).map((option) => ({
            option,
            label: describeInstallmentOption(option, policy),
          }))
        : [],
    [policy, amountCents, parcela],
  );
  const chosen = options.find((o) => o.option.installments === installments) ?? options[0];

  if (config.isLoading) return <p className="text-body-sm text-muted">Carregando o pagamento…</p>;
  if (!policy?.enabled) {
    return <p className="text-body-sm text-muted">Pagamento com cartão indisponível no momento. Use o PIX.</p>;
  }

  const finalidade: Pick<CardChargeArgs, "date_change" | "fare_upgrade"> =
    charge.kind === "date_change"
      ? { date_change: { check_in_at: charge.checkInAt, check_out_at: charge.checkOutAt, expected_delta_cents: amountCents } }
      : { fare_upgrade: { target_tier: charge.targetTier, expected_delta_cents: amountCents } };
  const parcelas = parcela ? installments : 1;

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    if (travaEnvio.current) return;
    travaEnvio.current = true;
    setEnviando(true);
    try {
      let r;
      if (entry.isSaved) {
        r = await card.mutateAsync({ booking_code: bookingCode, installments: parcelas, payment_method_id: entry.cardChoice, ...finalidade });
      } else {
        const conferido = entry.validateNew();
        if ("error" in conferido) {
          toast.error(conferido.error);
          return;
        }
        const cartao = await entry.tokenizeNew(config.data!.public_key, conferido);
        r = await card.mutateAsync({ booking_code: bookingCode, installments: parcelas, ...cartao, ...finalidade });
        entry.rememberAddress(conferido.parts);
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

  const total = parcela ? (chosen?.option.totalCents ?? amountCents) : amountCents;
  return (
    <form onSubmit={pagar} className="space-y-4">
      <CardEntryFields entry={entry} idPrefix={charge.kind === "date_change" ? "dc" : "up"} />

      {parcela ? (
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
      ) : (
        <p className="text-caption-sm text-muted">À vista, sem parcelamento.</p>
      )}

      {antifraude && (
        <div role="alert" className="space-y-3 rounded-md border border-hairline bg-surface-soft p-4 text-body-md text-body">
          <p className="text-pretty">A análise de segurança não liberou este cartão. Pague no PIX.</p>
          <Button type="button" variant="secondary" onClick={onUsePix}>
            Pagar com PIX
          </Button>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={enviando || card.isPending}>
        {enviando || card.isPending ? "Processando…" : `Pagar ${formatBRL(total / 100)} no cartão`}
      </Button>
    </form>
  );
}
