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
import { bandFor, formatBps, parseGatewayFeeSchedule } from "@/lib/gatewayFees";
import { useAppSettings } from "@/features/settings/api";
import { usePartnerFeeTable } from "@/features/commission/api";
import { partnerSchedule } from "@/features/commission/partnerFees.logic";
import { useBookingGatewayTrail, usePartnerBookingPayables } from "./api";
import { Bloco, Linha } from "./BookingMoneyCard";
import type { MoneyBreakdown } from "./bookingMoney.logic";
import {
  buildFeeDetail,
  latestPayables,
  partnerPayables,
  PARTNER_VIEW_MOVEPARK,
  type FeeBookingLike,
  type FeeDetail,
  type FeeLine,
  type FeePaymentLike,
} from "./bookingFees.logic";

const brl = (cents: number) => formatBRL(cents / 100);
const PAGADOR = { partner: "estacionamento", movepark: "Movepark", customer: "cliente" } as const;
// Na reserva do Operator (24/11/2026) quem lê é o próprio estacionamento.
const PAGADOR_OPERATOR = { partner: "você", movepark: "Movepark", customer: "cliente" } as const;
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
        {regra && <span className="text-pretty text-caption text-muted">{regra}</span>}
        {pagador && <span className="text-caption text-muted">quem paga: {pagador}</span>}
        {aviso && <span className="text-caption font-medium text-error">{aviso}</span>}
      </div>
      <span className="text-body-sm tabular-nums">{valor}</span>
    </div>
  );
}

/** `op`: a visão do estacionamento, que fala com "você" e não traz a conferência com o contrato. */
function descreve(l: FeeLine, pending: boolean, op: boolean) {
  // Sem recebível ainda, o valor espera a Pagar.me (24/11/2026: "apurando" não dizia o quê).
  const v = (c: number | null) => (c != null ? brl(c) : pending ? "a confirmar" : "-");
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
            ? pending
              ? "a Pagar.me ainda não informou"
              : l.method === "card"
                ? "sem detalhe por parcela"
                : "sem detalhe dos recebíveis"
            : op
              ? `${formatBps(l.effectiveBps)} nesta venda`
              : `${formatBps(l.effectiveBps)} nesta venda · contrato ${l.contractBps != null ? formatBps(l.contractBps) : "não cadastrado"}`,
        valor: v(l.cents),
        aviso: !op && l.differs ? "diferente do contrato" : null,
      };
    case "anticipation": {
      let regra = "sem detalhe por parcela";
      if (l.expected) {
        regra = `prevista${l.anticipatedAt ? ` para perto de ${formatDate(l.anticipatedAt)}` : ""}: as parcelas entram junto com a 1ª`;
        regra +=
          l.compCents > 0
            ? ` · a Movepark já passou ${brl(l.compCents)} da parte dela para ${op ? "você" : "o estacionamento"} cobrir`
            : op
              ? " · sai da sua parte"
              : " · sai da parte do estacionamento";
      } else if (l.cents === 0) regra = "ainda não antecipado";
      else if (l.cents != null) {
        regra = `${op ? "você" : "estacionamento"} ${brl(l.partnerCents)} · Movepark ${brl(l.moveparkCents)}`;
        if (l.anticipatedAt) regra += ` · antecipado em ${formatDate(l.anticipatedAt)}`;
        if (l.compCents > 0)
          regra += ` · a Movepark passou ${brl(l.compCents)} da parte dela para cobrir`;
        if (l.payer === "movepark" && l.creditCents > 0)
          regra += ` · a Movepark devolveu ${brl(l.creditCents)} ${op ? "para você" : "ao estacionamento"}`;
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
    case "cession":
      return op
        ? {
            label: "Ajuste a seu favor",
            regra: "a Movepark passou da parte dela nesta venda; o valor fica com você",
            valor: brl(l.cents),
            aviso: null,
          }
        : {
            label: "Cessão ao estacionamento",
            regra:
              "regra antiga (até 23/11/2026) cedia a antecipação também à vista; como à vista não tem antecipação, ficou com o estacionamento",
            valor: brl(l.cents),
            aviso: null,
          };
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

const PARCELAS = Array.from({ length: 12 }, (_, i) => i + 1);

function Conteudo({
  d,
  anticipationBps,
  op,
}: {
  d: FeeDetail;
  anticipationBps: number | null;
  /** Visão do estacionamento: só a parte dele no resumo, sem a conferência interna. */
  op: boolean;
}) {
  const s = d.summary;
  const cartao = s.method === "card";
  const comoPagou = cartao
    ? ` em ${s.installments}x de ${brl(s.installmentCents)}${
        s.firstInstallmentCents !== s.installmentCents
          ? ` (a 1ª de ${brl(s.firstInstallmentCents)})`
          : ""
      }`
    : " no Pix";
  const g = d.gateway;
  // Enquanto a Pagar.me não informa, o líquido do estacionamento ainda não tem a taxa dele.
  const taxaDoParceiroPendente =
    g.pending && d.lines.some((l) => l.key === "mdr" && l.payer === "partner");
  const notas = [
    s.custody ? "sem split: o valor ficou com a Movepark" : null,
    taxaDoParceiroPendente
      ? op
        ? "a taxa da Pagar.me ainda vai ser descontada"
        : "a taxa da Pagar.me ainda vai sair da parte do estacionamento"
      : null,
    s.refundedCents > 0 ? `estornado ao cliente: ${brl(s.refundedCents)}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  const totalGateway = g.linesCents ?? g.recordedCents;

  return (
    <div className="flex flex-col gap-4">
      <Bloco title="Resumo" hint={notas || undefined}>
        <Linha
          label={`O cliente pagou${comoPagou}`}
          value={brl(s.chargedCents)}
          testId="taxas-cobrado"
        />
        {op ? (
          <Linha
            label={s.custody ? "A repassar" : "Você recebe"}
            value={s.partnerNetCents != null ? brl(s.partnerNetCents) : "-"}
            strong
            testId="taxas-voce-recebe"
          />
        ) : (
          <>
            <Linha
              label="O estacionamento recebe"
              value={s.partnerNetCents != null ? brl(s.partnerNetCents) : "-"}
            />
            <Linha
              label="A Movepark fica com"
              value={s.moveparkNetCents != null ? brl(s.moveparkNetCents) : "-"}
              strong
            />
          </>
        )}
      </Bloco>

      <Bloco title="Taxas cobradas nesta venda">
        <div className="flex flex-col">
          {d.lines
            // Pix não tem antifraude; e o estacionamento só vê o antifraude quando a venda pagou.
            .filter(
              (l) => l.key !== "antifraud" || (cartao && (!op || (l.cents != null && l.cents > 0))),
            )
            .map((l) => (
              <TaxaLinha
                key={l.key}
                {...descreve(l, g.pending, op)}
                pagador={(op ? PAGADOR_OPERATOR : PAGADOR)[l.payer]}
                testId={`taxa-${l.key}`}
              />
            ))}
          <TaxaLinha
            label="Total do gateway"
            regra={
              [
                g.pending && totalGateway == null
                  ? "a Pagar.me ainda não informou as taxas desta venda"
                  : null,
                g.expectedCents > 0 && totalGateway != null
                  ? `com a antecipação prevista: ${brl(totalGateway + g.expectedCents)}`
                  : !g.detailed && g.recordedCents != null
                    ? "sem detalhe por parcela"
                    : null,
                d.cet30Bps != null
                  ? `${op ? "tabela" : "contrato"} para receber em 30 dias: ${formatBps(d.cet30Bps)} (${brl(Math.round((s.chargedCents * d.cet30Bps) / 10000))})`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || null
            }
            pagador={null}
            valor={totalGateway != null ? brl(totalGateway) : "a confirmar"}
            aviso={
              !op && g.stale && g.recordedCents != null
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
                    <td className="text-right">
                      {p.originalDate ? formatDate(p.originalDate) : "-"}
                    </td>
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
              <span className="text-pretty text-caption text-muted">
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
                <table className="w-full text-body-sm tabular-nums">
                  <thead className="text-caption text-muted">
                    <tr>
                      <th className="px-2 py-1 text-left font-normal">Cartão</th>
                      <th className="px-2 text-right font-normal">Taxa</th>
                      {d.schedule.cet30_bps && (
                        <th className="px-2 text-right font-normal">Em 30 dias</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {PARCELAS.map((n) => {
                      const atual = cartao && n === d.plan.chosen;
                      const faixa = bandFor(d.schedule, n);
                      return (
                        <tr
                          key={n}
                          aria-current={atual ? "true" : undefined}
                          className={atual ? "bg-canvas font-medium text-primary" : "text-body"}
                        >
                          <td className="px-2 py-1">{n}x</td>
                          <td className="px-2 text-right">{faixa ? formatBps(faixa.bps) : "-"}</td>
                          {d.schedule?.cet30_bps && (
                            <td className="px-2 text-right">
                              {formatBps(d.schedule.cet30_bps[n - 1])}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <LinhaTabela rotulo="Pix" valor={formatBps(d.schedule.pix_bps)} atual={!cartao} />
                {anticipationBps != null && (
                  <LinhaTabela
                    rotulo="Antecipação automática"
                    valor={`${formatBps(anticipationBps)} ao mês`}
                    atual={false}
                  />
                )}
                {(!op || d.schedule.antifraud_cents > 0) && (
                  <LinhaTabela
                    rotulo="Antifraude"
                    valor={brl(d.schedule.antifraud_cents)}
                    atual={false}
                  />
                )}
                {!op && d.schedule.processing_cents != null && (
                  <LinhaTabela
                    rotulo="Gateway por transação"
                    valor={brl(d.schedule.processing_cents)}
                    atual={false}
                  />
                )}
              </>
            ) : (
              <span className="text-pretty text-caption text-muted">
                {op
                  ? "A tabela ainda não foi cadastrada. Fale com a Movepark."
                  : "Tabela não cadastrada. Cadastre em Configurações, aba Pagamentos."}
              </span>
            )}
          </div>
        </div>
      </Bloco>
    </div>
  );
}

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  money: MoneyBreakdown;
  payment: FeePaymentLike & { id: string };
  booking: FeeBookingLike;
};

function Janela({
  open,
  onOpenChange,
  op,
  d,
  anticipationBps,
}: Pick<DialogProps, "open" | "onOpenChange"> & {
  op: boolean;
  d: FeeDetail | null;
  anticipationBps: number | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        data-testid="taxas-da-reserva"
      >
        <DialogHeader>
          <DialogTitle>Taxas da reserva</DialogTitle>
          <DialogDescription>
            {op
              ? "Quem pagou cada taxa desta venda e quando o dinheiro entra."
              : "O que cada um pagou nesta venda e a tabela que valeu para ela."}
          </DialogDescription>
        </DialogHeader>
        {d ? (
          <Conteudo d={d} anticipationBps={anticipationBps} op={op} />
        ) : (
          <Skeleton className="h-64 w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Manager (hub_admin): o rastro do gateway e a tabela contratada inteira, de app_setting. */
function TaxasManager(p: DialogProps) {
  const trail = useBookingGatewayTrail(p.bookingId, p.open);
  const settings = useAppSettings();
  const rate = Number(settings.data?.card_anticipation_rate_monthly_bps);
  const anticipationBps =
    settings.data?.card_anticipation_rate_monthly_bps && Number.isFinite(rate) ? rate : null;
  const d =
    trail.isLoading || settings.isLoading
      ? null
      : buildFeeDetail({
          money: p.money,
          payment: p.payment,
          booking: p.booking,
          payables: latestPayables(trail.data?.events, p.payment.id),
          schedule: parseGatewayFeeSchedule(settings.data?.gateway_fee_schedule),
          policy: parseInstallmentPolicy(settings.data?.card_installment_policy),
          moveparkRecipientId: settings.data?.pagarme_movepark_recipient_id ?? null,
        });
  return <Janela {...p} op={false} d={d} anticipationBps={anticipationBps} />;
}

/**
 * Operator (24/11/2026): o estacionamento não lê o rastro nem app_setting. Os recebíveis vêm da
 * `partner_booking_payables` e a tabela da `partner_fee_table`, as duas com finance:read.
 */
function TaxasOperator(p: DialogProps & { companyId: string }) {
  const payables = usePartnerBookingPayables(p.bookingId, p.open);
  const table = usePartnerFeeTable(p.companyId);
  const d =
    payables.isLoading || table.isLoading
      ? null
      : buildFeeDetail({
          money: p.money,
          payment: p.payment,
          booking: p.booking,
          payables: partnerPayables(payables.data, p.payment.id),
          schedule: table.data ? partnerSchedule(table.data) : null,
          policy: parseInstallmentPolicy(
            (table.data?.policy ?? null) as Parameters<typeof parseInstallmentPolicy>[0],
          ),
          moveparkRecipientId: PARTNER_VIEW_MOVEPARK,
        });
  return <Janela {...p} op d={d} anticipationBps={table.data?.anticipation_rate_bps ?? null} />;
}

/**
 * Taxas da reserva (23/11/2026): resumo, cada taxa com regra e quem pagou, as parcelas e a tabela
 * que valeu para a venda. O Manager vê a conta inteira; desde 24/11/2026 o estacionamento abre o
 * mesmo modal na reserva dele, com a parte dele. Spec: docs/specs/taxas-da-reserva.md
 */
export function BookingFeesDialog({
  audience = "manager",
  companyId,
  ...p
}: DialogProps & { audience?: "manager" | "operator"; companyId?: string | null }) {
  if (audience === "operator") {
    if (!companyId) return null;
    return <TaxasOperator {...p} companyId={companyId} />;
  }
  return <TaxasManager {...p} />;
}
