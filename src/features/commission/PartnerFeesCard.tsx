import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { formatBps } from "@/lib/gatewayFees";
import { usePartnerFeeTable } from "./api";
import {
  cardRows,
  channelInstallments,
  channelLabel,
  installmentText,
  partnerSchedule,
  payerLabel,
} from "./partnerFees.logic";

const brl = (cents: number) => formatBRL(cents / 100);
const pctInt = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/**
 * "Entenda as nossas taxas" (Operator › Financeiro, 23/11/2026): o que sai de cada venda, para o
 * estacionamento não precisar perguntar. Quem paga cada taxa por canal, o cartão de 1x a 12x com a
 * antecipação para receber em 30 dias, Pix, saque e o parcelamento do cliente. Sem dados (carregando
 * ou sem finance:read), não aparece. Spec: docs/specs/taxas-da-reserva.md
 */
export function PartnerFeesCard({ companyId }: { companyId: string }) {
  const { data } = usePartnerFeeTable(companyId);
  if (!data) return null;
  const schedule = partnerSchedule(data);
  const parcelamentos = data.channels.map((c) => ({ c, texto: installmentText(channelInstallments(data, c)) }));
  const parcelamentoUnico = new Set(parcelamentos.map((p) => p.texto)).size === 1;

  return (
    <Card data-testid="taxas-do-parceiro">
      <CardHeader>
        <CardTitle>Entenda as nossas taxas</CardTitle>
        <p className="mt-1 max-w-[68ch] text-pretty text-body-sm text-muted">
          O que sai de cada venda: a comissão da Movepark e as taxas da Pagar.me, que processa os
          pagamentos.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h3 className="text-title-sm text-ink">Quem paga cada taxa</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm" data-testid="taxas-canais">
              <thead className="text-caption text-muted">
                <tr>
                  <th className="py-1 pr-4 text-left font-normal">Canal</th>
                  <th className="px-2 text-right font-normal">Comissão</th>
                  <th className="px-2 text-right font-normal">Cartão e Pix</th>
                  <th className="pl-2 text-right font-normal">Antecipação</th>
                </tr>
              </thead>
              <tbody>
                {data.channels.map((c) => (
                  <tr key={c.name ?? "movepark"} className="border-t border-hairline">
                    <td className="py-2 pr-4 text-ink">{channelLabel(c)}</td>
                    <td className="px-2 text-right tabular-nums">{pctInt(c.take_rate_bps)}</td>
                    <td className="px-2 text-right">{payerLabel(c.card_fee_payer)}</td>
                    <td className="pl-2 text-right">{payerLabel(c.anticipation_payer)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {schedule ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-title-sm text-ink">Cartão: o dinheiro entra inteiro em 30 dias</h3>
            <p className="max-w-[68ch] text-pretty text-caption text-muted">
              A Pagar.me antecipa as parcelas para o dinheiro cair em 30 dias, sem esperar mês a mês.
              À vista não tem antecipação. A taxa do cartão é sobre o valor da venda; a antecipação,
              sobre o valor antecipado.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm tabular-nums" data-testid="taxas-cartao">
                <thead className="text-caption text-muted">
                  <tr>
                    <th className="py-1 pr-4 text-left font-normal">Parcelas</th>
                    <th className="px-2 text-right font-normal">Taxa do cartão</th>
                    <th className="px-2 text-right font-normal">Antecipação</th>
                    <th className="pl-2 text-right font-normal">Total em 30 dias</th>
                  </tr>
                </thead>
                <tbody>
                  {cardRows(schedule).map((r) => (
                    <tr key={r.installments} className="border-t border-hairline">
                      <td className="py-1 pr-4">{r.installments}x</td>
                      <td className="px-2 text-right">{formatBps(r.cardBps)}</td>
                      <td className="px-2 text-right">{formatBps(r.anticipationBps)}</td>
                      <td className="pl-2 text-right">{formatBps(r.totalBps)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col gap-1 text-body-sm text-body">
              <li>Pix: {formatBps(schedule.pix_bps)}, o dinheiro entra na hora.</li>
              {data.antifraud_cents != null && data.antifraud_cents > 0 && (
                <li>Antifraude: {brl(data.antifraud_cents)} por venda.</li>
              )}
              {data.withdrawal_fee_cents != null && (
                <li>
                  Saque para o banco: {brl(data.withdrawal_fee_cents)} por saque que você pedir. O
                  repasse automático do mês não tem custo.
                </li>
              )}
            </ul>
          </section>
        ) : (
          <p className="text-body-sm text-muted">
            A tabela de taxas do cartão ainda não foi cadastrada. Fale com a Movepark.
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-title-sm text-ink">Parcelamento para o cliente</h3>
          {parcelamentoUnico ? (
            <p className="text-body-sm text-body">{parcelamentos[0]?.texto}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-body-sm text-body">
              {parcelamentos.map(({ c, texto }) => (
                <li key={c.name ?? "movepark"}>
                  {channelLabel(c)}: {texto}
                </li>
              ))}
            </ul>
          )}
          <p className="max-w-[68ch] text-pretty text-caption text-muted">
            Quer outra condição, como mais parcelas sem juros ou juros desde a 2ª parcela? Fale com a
            Movepark: o parcelamento é ajustado por canal.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
