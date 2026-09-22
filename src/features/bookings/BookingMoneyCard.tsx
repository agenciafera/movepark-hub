import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, formatDate } from "@/lib/format";
import type { MoneyBreakdown } from "./bookingMoney.logic";

const brl = (cents: number) => formatBRL(cents / 100);
const signed = (cents: number) => (cents < 0 ? `−${brl(-cents)}` : brl(cents));
const METODO: Record<string, string> = { pix: "PIX", card: "cartão" };

function Linha({ label, value, strong, muted, testId }: { label: string; value: string; strong?: boolean; muted?: boolean; testId?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? "border-t border-hairline pt-2 font-medium text-ink" : muted ? "text-muted" : "text-body"}`}>
      <span className="text-body-sm">{label}</span>
      <span className="text-body-sm tabular-nums" data-testid={testId}>{value}</span>
    </div>
  );
}

function Bloco({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-hairline bg-surface-soft p-4">
      <div>
        <div className="text-title-sm text-ink">{title}</div>
        {hint && <div className="text-caption text-muted text-pretty">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * O dinheiro da reserva destrinchado (18/09/2026): o que o cliente pagou, o que foi para o
 * estacionamento, o que ficou com a Movepark, a taxa do gateway e o estorno. Só Manager.
 */
export function BookingMoneyCard({ money, audience = "manager" }: { money: MoneyBreakdown; audience?: "manager" | "operator" }) {
  const { customer, split, refund } = money;
  // O estacionamento vê o que o cliente pagou e a parte dele. A coluna da Movepark (comissão,
  // plano, taxa do gateway) é da Movepark; taxa de processamento não aparece para ele.
  const parceiro = audience === "operator";
  const meio = customer.method ? METODO[customer.method] ?? customer.method : null;
  return (
    <Card data-testid="reserva-valores">
      <CardHeader>
        <CardTitle>Valores</CardTitle>
      </CardHeader>
      <CardContent className={`grid gap-4 ${parceiro ? "desktop:grid-cols-2" : "desktop:grid-cols-3"}`}>
        <Bloco title="O cliente pagou" hint={meio ? `${meio}${customer.installments && customer.installments > 1 ? ` em ${customer.installments}x` : ""}` : "ainda sem pagamento"}>
          {customer.lines.map((l) => (
            <Linha key={`${l.kind}-${l.label}`} label={l.label} value={signed(l.cents)} />
          ))}
          <Linha label="Total cobrado" value={brl(customer.chargedCents ?? customer.totalCents)} strong testId="valores-total" />
        </Bloco>

        <Bloco
          title={parceiro ? "Sua parte" : "Estacionamento"}
          hint={
            !split
              ? "entra quando o pagamento for aprovado"
              : split.custody
                ? parceiro
                  ? "o valor ficou com a Movepark e chega por repasse"
                  : "cobrança sem split: o valor ficou com a Movepark e chega por repasse"
                : split.partner.withdrawAt
                  ? parceiro
                    ? `libera para saque em ${formatDate(split.partner.withdrawAt)}`
                    : `libera para saque em ${formatDate(split.partner.withdrawAt)}${split.partner.releaseAt ? `; o gateway libera o recebível em ${formatDate(split.partner.releaseAt)}` : ""}`
                  : split.partner.releaseAt
                    ? `libera no gateway em ${formatDate(split.partner.releaseAt)}`
                    : "data de liberação ainda não apurada"
          }
        >
          {split ? (
            <>
              <Linha label="Parte do estacionamento" value={brl(split.partner.grossCents)} />
              {split.partner.debtRecoveredCents > 0 && <Linha label="Abatimento de dívida" value={signed(-split.partner.debtRecoveredCents)} muted />}
              {split.partner.feeCents > 0 && (
                <Linha label={parceiro ? "Taxa do gateway (por sua conta nesta venda)" : "Taxa do gateway"} value={signed(-split.partner.feeCents)} muted />
              )}
              {split.feePending && split.feePayer === "partner" && !split.custody && (
                <Linha label={parceiro ? "Taxa do gateway (por sua conta nesta venda)" : "Taxa do gateway"} value="apurando…" muted />
              )}
              <Linha label={split.custody ? "A repassar" : parceiro ? "Você recebe" : "Líquido do estacionamento"} value={brl(split.partner.netCents)} strong testId="valores-parceiro" />
            </>
          ) : (
            <Linha label="Parte do estacionamento" value="-" muted />
          )}
        </Bloco>

        {!parceiro && (
          <Bloco title="Movepark" hint={split?.feePending ? "taxa do gateway ainda não apurada; a Pagar.me informa segundos depois do pagamento" : undefined}>
          {split ? (
            <>
              <Linha label="Comissão" value={brl(split.movepark.commissionCents)} />
              {split.movepark.fareCents > 0 && <Linha label="Plano (tarifa)" value={brl(split.movepark.fareCents)} />}
              {split.movepark.interestCents > 0 && <Linha label="Juros do parcelamento" value={brl(split.movepark.interestCents)} />}
              {split.movepark.debtRecoveredCents > 0 && <Linha label="Dívida recuperada" value={brl(split.movepark.debtRecoveredCents)} />}
              {split.movepark.feeCents > 0 && <Linha label="Taxa do gateway" value={signed(-split.movepark.feeCents)} muted />}
              {split.feePending && split.feePayer === "movepark" && <Linha label="Taxa do gateway" value="apurando…" muted />}
              {/* Quando o estacionamento paga a taxa, o líquido da Movepark é a comissão inteira; a linha diz isso para ninguém procurar o desconto. */}
              {!split.feePending && split.feePayer === "partner" && !split.custody && (
                <Linha label="Taxa do gateway" value="por conta do estacionamento" muted testId="valores-taxa-parceiro" />
              )}
              <Linha label="Líquido da Movepark" value={brl(split.movepark.netCents)} strong testId="valores-movepark" />
            </>
          ) : (
            <Linha label="Comissão" value="-" muted />
          )}
        </Bloco>
        )}

        {refund && (
          <div className={parceiro ? "desktop:col-span-2" : "desktop:col-span-3"} data-testid="valores-estorno">
            <Bloco
              title="Estorno"
              hint={
                refund.debtCents > 0
                  ? parceiro
                    ? "a Movepark devolveu ao cliente a sua parte; ela abate sozinha nas próximas vendas"
                    : "a Movepark pagou a parte do estacionamento; virou dívida dele, abatida nas próximas vendas"
                  : undefined
              }
            >
              <Linha label="Devolvido ao cliente" value={brl(refund.totalCents)} />
              <Linha label={parceiro ? "Saiu do seu saldo" : "Saiu do estacionamento (gateway debitou)"} value={brl(refund.partnerCents)} muted />
              {!parceiro && <Linha label="Saiu da Movepark" value={brl(refund.moveparkCents)} muted />}
              {refund.debtCents > 0 && <Linha label={parceiro ? "A abater nas próximas vendas" : "Dívida gerada para o estacionamento"} value={brl(refund.debtCents)} strong />}
            </Bloco>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
