import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDate } from "@/lib/format";
import { parseInstallmentPolicy } from "@/lib/installments";
import { formatBps, parseGatewayFeeSchedule } from "@/lib/gatewayFees";
import { useAppSettings } from "@/features/settings/api";
import { useBookingGatewayTrail } from "./api";
import { Bloco, Linha } from "./BookingMoneyCard";
import type { MoneyBreakdown } from "./bookingMoney.logic";
import {
  buildFeeDetail,
  latestPayables,
  type FeeBookingLike,
  type FeeDetail,
  type FeeLine,
  type FeePaymentLike,
} from "./bookingFees.logic";

const brl = (cents: number) => formatBRL(cents / 100);
const PAGADOR = { partner: "estacionamento", movepark: "Movepark", customer: "cliente" } as const;
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

function TaxaLinha({
  label,
  regra,
  pagador,
  valor,
  aviso,
  forte,
  testId,
}: {
  label: string;
  regra: string | null;
  pagador: string | null;
  valor: string;
  aviso: string | null;
  forte?: boolean;
  testId: string;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 py-2 ${forte ? "border-t border-hairline font-medium" : ""}`}
      data-testid={testId}
    >
      <div className="flex flex-col">
        <span className="text-body-sm text-ink">{label}</span>
        {regra && <span className="text-caption text-muted text-pretty">{regra}</span>}
        {pagador && <span className="text-caption text-muted">quem paga: {pagador}</span>}
        {aviso && <span className="text-caption font-medium text-error">{aviso}</span>}
      </div>
      <span className="text-body-sm tabular-nums">{valor}</span>
    </div>
  );
}

function descreve(l: FeeLine, pending: boolean) {
  const v = (c: number | null) => (c != null ? brl(c) : pending ? "apurando" : "-");
  switch (l.key) {
    case "commission":
      return {
        label: "Comissão Movepark",
        regra:
          l.rateBps != null
            ? `${formatBps(l.rateBps)} sobre as diárias${l.channel ? ` · canal ${l.channel}` : ""}`
            : null,
        valor: l.cents != null ? brl(l.cents) : "-",
        aviso: null,
      };
    case "interest":
      return {
        label: "Juros do parcelamento",
        regra: l.rule
          ? `${pct(l.rule.monthlyPct)} ao mês acima de ${l.rule.freeUpTo}x`
          : "condição da época da compra",
        valor: brl(l.cents),
        aviso: null,
      };
    case "mdr":
      return {
        label: l.method === "card" ? "Cartão (Pagar.me)" : "Pix (Pagar.me)",
        regra:
          l.effectiveBps == null
            ? "sem detalhe por parcela"
            : `${formatBps(l.effectiveBps)} nesta venda · contrato ${l.contractBps != null ? formatBps(l.contractBps) : "não cadastrado"}`,
        valor: v(l.cents),
        aviso: l.differs ? "diferente do contrato" : null,
      };
    case "anticipation": {
      let regra = "sem detalhe por parcela";
      if (l.expected) {
        regra = `prevista${l.anticipatedAt ? ` para perto de ${formatDate(l.anticipatedAt)}` : ""}: as parcelas entram junto com a 1ª · a Movepark já cedeu ${brl(l.compCents)} no split para cobrir`;
      } else if (l.cents === 0) regra = "ainda não antecipado";
      else if (l.cents != null) {
        regra = `estacionamento ${brl(l.partnerCents)} · Movepark ${brl(l.moveparkCents)}`;
        if (l.anticipatedAt) regra += ` · antecipado em ${formatDate(l.anticipatedAt)}`;
        if (l.compCents > 0) regra += ` · a Movepark cedeu ${brl(l.compCents)} no split`;
        if (l.payer === "movepark" && l.creditCents > 0)
          regra += ` · a Movepark devolveu ${brl(l.creditCents)} ao estacionamento`;
      }
      return {
        label: "Antecipação (Pagar.me)",
        regra,
        valor: l.expected && l.cents != null ? `${brl(l.cents)} previstos` : v(l.cents),
        aviso: null,
      };
    }
    case "antifraud":
      return { label: "Antifraude (Pagar.me)", regra: null, valor: v(l.cents), aviso: null };
  }
}

function LinhaTabela({ rotulo, valor, atual }: { rotulo: string; valor: string; atual: boolean }) {
  return (
    <div
      aria-current={atual ? "true" : undefined}
      className={`flex justify-between gap-4 rounded px-2 py-1 text-body-sm ${atual ? "bg-canvas font-medium text-primary" : "text-body"}`}
    >
      <span>{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

function Conteudo({ d }: { d: FeeDetail }) {
  const s = d.summary;
  const cartao = s.method === "card";
  const comoPagou = cartao
    ? ` em ${s.installments}x de ${brl(s.installmentCents)}${
        s.firstInstallmentCents !== s.installmentCents
          ? ` (a 1ª de ${brl(s.firstInstallmentCents)})`
          : ""
      }`
    : " no Pix";
  const notas = [
    s.custody ? "sem split: o valor ficou com a Movepark" : null,
    s.refundedCents > 0 ? `estornado ao cliente: ${brl(s.refundedCents)}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  const g = d.gateway;
  const totalGateway = g.linesCents ?? g.recordedCents;

  return (
    <div className="flex flex-col gap-4">
      <Bloco title="Resumo" hint={notas || undefined}>
        <Linha label={`O cliente pagou${comoPagou}`} value={brl(s.chargedCents)} testId="taxas-cobrado" />
        <Linha
          label="O estacionamento recebe"
          value={s.partnerNetCents != null ? brl(s.partnerNetCents) : "-"}
        />
        <Linha
          label="A Movepark fica com"
          value={s.moveparkNetCents != null ? brl(s.moveparkNetCents) : "-"}
          strong
        />
      </Bloco>

      <Bloco title="Taxas cobradas nesta venda">
        <div className="flex flex-col">
          {d.lines.map((l) => (
            <TaxaLinha
              key={l.key}
              {...descreve(l, g.pending)}
              pagador={PAGADOR[l.payer]}
              testId={`taxa-${l.key}`}
            />
          ))}
          <TaxaLinha
            label="Total do gateway"
            regra={
              g.expectedCents > 0 && totalGateway != null
                ? `com a antecipação prevista: ${brl(totalGateway + g.expectedCents)}`
                : !g.detailed && g.recordedCents != null
                  ? "sem detalhe por parcela"
                  : null
            }
            pagador={null}
            valor={totalGateway != null ? brl(totalGateway) : "apurando"}
            aviso={
              g.stale && g.recordedCents != null
                ? `recebíveis desatualizados: o pagamento registra ${brl(g.recordedCents)}`
                : null
            }
            forte
            testId="taxa-total"
          />
        </div>
      </Bloco>

      {cartao && (
        <Bloco
          title="Parcelas"
          hint={
            !g.detailed
              ? "sem detalhe por parcela"
              : d.installments.some((p) => p.expected)
                ? "previsão: a Pagar.me antecipa por volta do D+29 e as parcelas entram junto com a 1ª"
                : undefined
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm tabular-nums" data-testid="taxas-parcelas">
              <thead className="text-caption text-muted">
                <tr>
                  <th className="py-1 text-left font-normal">Parcela</th>
                  <th className="text-right font-normal">Valor</th>
                  <th className="text-right font-normal">Vencimento</th>
                  <th className="text-right font-normal">Entra</th>
                  <th className="text-right font-normal">Taxas</th>
                </tr>
              </thead>
              <tbody>
                {d.installments.map((p) => (
                  <tr key={p.installment} className="border-t border-hairline">
                    <td className="py-1">{p.installment}ª</td>
                    <td className="text-right">{brl(p.customerCents)}</td>
                    <td className="text-right">{p.originalDate ? formatDate(p.originalDate) : "-"}</td>
                    <td className="text-right">
                      {p.receivedDate
                        ? `${formatDate(p.receivedDate)}${p.expected ? " (prevista)" : ""}`
                        : "-"}
                    </td>
                    <td className="text-right">
                      {p.mdrCents != null && p.anticipationCents != null
                        ? brl(p.mdrCents + p.anticipationCents)
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloco>
      )}

      <Bloco title="Tabela de taxas">
        <div className="grid gap-4 tablet:grid-cols-2">
          <div className="flex flex-col gap-1" data-testid="tabela-parcelamento">
            <span className="text-body-sm font-medium text-ink">Parcelamento desta reserva</span>
            {!d.plan.reproduces && (
              <span className="text-caption text-muted text-pretty">
                pela política de hoje; a venda seguiu outra condição
              </span>
            )}
            {d.plan.options.map((o) => (
              <LinhaTabela
                key={o.installments}
                rotulo={`${o.installments}x de ${brl(o.installmentCents)}`}
                valor={o.hasInterest ? `total ${brl(o.totalCents)}` : "sem juros"}
                atual={cartao && o.installments === d.plan.chosen}
              />
            ))}
          </div>
          <div className="flex flex-col gap-1" data-testid="tabela-gateway">
            <span className="text-body-sm font-medium text-ink">Taxas do gateway</span>
            {d.schedule ? (
              <>
                <LinhaTabela rotulo="Pix" valor={formatBps(d.schedule.pix_bps)} atual={!cartao} />
                {d.schedule.card.map((b) => (
                  <LinhaTabela
                    key={b.from}
                    rotulo={b.from === b.to ? `Cartão ${b.from}x` : `Cartão ${b.from}x a ${b.to}x`}
                    valor={formatBps(b.bps)}
                    atual={cartao && d.band?.from === b.from}
                  />
                ))}
                <LinhaTabela
                  rotulo="Antifraude"
                  valor={brl(d.schedule.antifraud_cents)}
                  atual={false}
                />
              </>
            ) : (
              <span className="text-caption text-muted text-pretty">
                Tabela não cadastrada. Cadastre em Configurações, aba Pagamentos.
              </span>
            )}
          </div>
        </div>
      </Bloco>
    </div>
  );
}

/**
 * Taxas da reserva (23/11/2026): resumo, cada taxa com regra e quem pagou, as parcelas e a tabela
 * que valeu para a venda. Só o Manager abre. Spec: docs/specs/taxas-da-reserva.md
 */
export function BookingFeesDialog({
  open,
  onOpenChange,
  bookingId,
  money,
  payment,
  booking,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  money: MoneyBreakdown;
  payment: FeePaymentLike & { id: string };
  booking: FeeBookingLike;
}) {
  const trail = useBookingGatewayTrail(bookingId, open);
  const settings = useAppSettings();
  const d =
    trail.isLoading || settings.isLoading
      ? null
      : buildFeeDetail({
          money,
          payment,
          booking,
          payables: latestPayables(trail.data?.events, payment.id),
          schedule: parseGatewayFeeSchedule(settings.data?.gateway_fee_schedule),
          policy: parseInstallmentPolicy(settings.data?.card_installment_policy),
          moveparkRecipientId: settings.data?.pagarme_movepark_recipient_id ?? null,
        });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" data-testid="taxas-da-reserva">
        <DialogHeader>
          <DialogTitle>Taxas da reserva</DialogTitle>
          <DialogDescription>
            O que cada um pagou nesta venda e a tabela que valeu para ela.
          </DialogDescription>
        </DialogHeader>
        {d ? <Conteudo d={d} /> : <Skeleton className="h-64 w-full" />}
      </DialogContent>
    </Dialog>
  );
}
