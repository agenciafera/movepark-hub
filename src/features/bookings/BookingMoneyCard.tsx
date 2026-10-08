import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, formatDate } from "@/lib/format";
import { partnerMoneyView, type MoneyBreakdown } from "./bookingMoney.logic";
import { customerBlockCopy, type CustomerPaymentState } from "./bookingState.logic";

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

/** Quando a parte do estacionamento entra (ou por que não entra). */
function partnerHint(split: MoneyBreakdown["split"], semPagamento: boolean, parceiro: boolean): string {
  if (!split) return semPagamento ? "não entra: a reserva não foi paga" : "entra quando o pagamento for aprovado";
  if (split.custody)
    return parceiro ? "o valor ficou com a Movepark e chega por repasse" : "cobrança sem split: o valor ficou com a Movepark e chega por repasse";
  if (split.partner.withdrawAt)
    return parceiro
      ? `libera para saque em ${formatDate(split.partner.withdrawAt)}`
      : `libera para saque em ${formatDate(split.partner.withdrawAt)}${split.partner.releaseAt ? `; o gateway libera o recebível em ${formatDate(split.partner.releaseAt)}` : ""}`;
  if (split.partner.releaseAt) return `libera no gateway em ${formatDate(split.partner.releaseAt)}`;
  return "data de liberação ainda não apurada";
}

function Estorno({ refund, parceiro }: { refund: NonNullable<MoneyBreakdown["refund"]>; parceiro: boolean }) {
  return (
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
  );
}

/**
 * A visão do estacionamento (08/10/2026): o número grande é o das diárias, que é o que ele vende,
 * e a conta embaixo fecha diárias menos comissão no que ele recebe. O total cobrado do cliente e o
 * plano saem do destaque e viram uma nota, somados como "taxas e custos da plataforma": não são
 * dinheiro do estacionamento e, em destaque, faziam a comissão parecer maior do que é.
 */
function PartnerMoney({ money, cliente, semPagamento }: { money: MoneyBreakdown; cliente: { title: string; hint: string }; semPagamento: boolean }) {
  const v = partnerMoneyView(money);
  const itens = money.customer.lines.filter((l) => l.kind === "parking" || l.kind === "addon").map((l) => l.label);
  const nota = `${cliente.title} ${brl(v.chargedCents)} (${cliente.hint})${v.platformCents > 0 ? `, já com ${brl(v.platformCents)} de taxas e custos da plataforma` : ""}.`;
  return (
    <Card data-testid="reserva-valores">
      <CardHeader>
        <CardTitle>Valores</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 desktop:grid-cols-2">
        <div className="flex flex-col justify-center gap-1 rounded-md border border-hairline bg-surface-soft p-4">
          <div className="text-caption text-muted">Valor das diárias</div>
          <div className="text-display-sm tabular-nums text-primary" data-testid="valores-diarias">{brl(v.parkingCents)}</div>
          {itens.length > 0 && <div className="text-caption text-muted text-pretty">{itens.join(" + ")}</div>}
        </div>

        <Bloco title="Sua parte" hint={partnerHint(money.split, semPagamento, true)}>
          <Linha label="Diárias" value={brl(v.parkingCents)} />
          {v.netCents == null ? (
            <Linha label="Você recebe" value="-" muted />
          ) : (
            <>
              {v.discountCents > 0 && <Linha label="Cupom" value={signed(-v.discountCents)} muted />}
              {v.commissionCents > 0 && <Linha label="Comissão Movepark" value={signed(-v.commissionCents)} muted testId="valores-comissao" />}
              {v.debtRecoveredCents > 0 && <Linha label="Abatimento de dívida" value={signed(-v.debtRecoveredCents)} muted />}
              {v.feeCents > 0 && <Linha label="Taxa do gateway (por sua conta nesta venda)" value={signed(-v.feeCents)} muted />}
              {v.feePending && <Linha label="Taxa do gateway (por sua conta nesta venda)" value="apurando…" muted />}
              <Linha label={v.custody ? "A repassar" : "Você recebe"} value={brl(v.netCents)} strong testId="valores-parceiro" />
            </>
          )}
        </Bloco>

        <p className="text-caption text-muted text-pretty desktop:col-span-2" data-testid="valores-cliente">
          {nota}
        </p>

        {money.refund && <Estorno refund={money.refund} parceiro />}
      </CardContent>
    </Card>
  );
}

/**
 * O dinheiro da reserva destrinchado (18/09/2026): o que o cliente pagou, o que foi para o
 * estacionamento, o que ficou com a Movepark, a taxa do gateway e o estorno. O estacionamento vê
 * a própria conta (`PartnerMoney`).
 */
export function BookingMoneyCard({
  money,
  audience = "manager",
  paymentState = "paid",
  bookingStatus = "confirmed",
}: {
  money: MoneyBreakdown;
  audience?: "manager" | "operator";
  /** Estado do pagamento visto pelo cliente (02/10/2026): "O cliente pagou" só quando pagou. */
  paymentState?: CustomerPaymentState;
  bookingStatus?: string;
}) {
  const { customer, split, refund } = money;
  const meio = customer.method ? METODO[customer.method] ?? customer.method : null;
  const cliente = customerBlockCopy(paymentState, meio, customer.installments, bookingStatus);
  const semPagamento = paymentState === "unpaid" || paymentState === "failed";
  // O estacionamento tem a própria conta: diárias, comissão e o que recebe. A coluna da Movepark
  // (plano, juros, taxa dela) não aparece para ele.
  if (audience === "operator") return <PartnerMoney money={money} cliente={cliente} semPagamento={semPagamento} />;
  return (
    <Card data-testid="reserva-valores">
      <CardHeader>
        <CardTitle>Valores</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 desktop:grid-cols-3">
        <Bloco title={cliente.title} hint={cliente.hint}>
          {customer.lines.map((l) => (
            <Linha key={`${l.kind}-${l.label}`} label={l.label} value={signed(l.cents)} />
          ))}
          <Linha label={paymentState === "paid" || paymentState === "refunded" || paymentState === "refunding" ? "Total cobrado" : "Total da reserva"} value={brl(customer.chargedCents ?? customer.totalCents)} strong testId="valores-total" />
        </Bloco>

        <Bloco title="Estacionamento" hint={partnerHint(split, semPagamento, false)}>
          {split ? (
            <>
              <Linha label="Parte do estacionamento" value={brl(split.partner.grossCents)} />
              {split.partner.debtRecoveredCents > 0 && <Linha label="Abatimento de dívida" value={signed(-split.partner.debtRecoveredCents)} muted />}
              {split.partner.feeCents > 0 && <Linha label="Taxa do gateway" value={signed(-split.partner.feeCents)} muted />}
              {split.feePending && split.feePayer === "partner" && !split.custody && <Linha label="Taxa do gateway" value="apurando…" muted />}
              <Linha label={split.custody ? "A repassar" : "Líquido do estacionamento"} value={brl(split.partner.netCents)} strong testId="valores-parceiro" />
            </>
          ) : (
            <Linha label="Parte do estacionamento" value="-" muted />
          )}
        </Bloco>

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

        {refund && <Estorno refund={refund} parceiro={false} />}
      </CardContent>
    </Card>
  );
}
