import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowsClockwise, Warning } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { usePartnerAccountStatement, usePayoutWithdrawable, useWithdraw } from "./api";
import { Checkbox } from "@/components/ui/checkbox";
import { MOVEMENT_LABEL, maxWithdrawReason, negativeRecipientAlert, releaseLabel, summarizeMovements, transferCycleLabel, type AccountMovement } from "./account.logic";
import { recentMonths } from "./months.logic";
import { useAutoRefreshBalances } from "./useAutoRefreshBalances";
import { WithdrawalsCard } from "./WithdrawalsCard";

const brl = (cents: number) => formatBRL(cents / 100);

const STATUS_LABEL: Record<string, string> = {
  created: "Solicitado",
  processing: "Processando",
  paid: "Pago",
  failed: "Falhou",
  canceled: "Cancelado",
  manual_payment: "Pagamento por fora",
  adjustment: "Ajuste",
};

/**
 * A conta do estacionamento (E0.3.7): saldo real no gateway, quando o dinheiro libera e vai para o
 * banco, dívida com a Movepark, e cada movimento com a reserva de origem. O mesmo componente no
 * Manager (qualquer empresa) e no Operator (a própria); o parceiro vê exatamente o que a Movepark
 * vê dele. Spec: docs/specs/conta-do-parceiro.md.
 */
export function PartnerAccount({
  companyId,
  canWithdraw,
  canRefund,
  showGateway = true,
}: {
  companyId: string;
  /** hub_admin ou Dono (`payouts:write`): mostra o botão Repassar. */
  canWithdraw: boolean;
  /** Só hub_admin: "Estornar" leva ao cancelamento com estorno da reserva. */
  canRefund: boolean;
  /**
   * Só o Manager vê o saldo bruto da Pagar.me e força a leitura. Para o parceiro (17/09/2026) o
   * número que vale é o nosso "disponível para saque": o que ele pode tirar é decisão da
   * Movepark, e mostrar o saldo real do gateway só geraria a pergunta "por que não posso sacar".
   */
  showGateway?: boolean;
}) {
  const months = React.useMemo(() => recentMonths(12), []);
  const [monthKey, setMonthKey] = React.useState(months[0].value);
  const period = months.find((m) => m.value === monthKey) ?? months[0];
  const statement = usePartnerAccountStatement({ companyId, from: period.from, to: period.to });
  const refresh = useAutoRefreshBalances(showGateway);
  const withdraw = useWithdraw();
  const withdrawable = usePayoutWithdrawable(companyId);
  const [withdrawOpen, setWithdrawOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<number | null>(null);
  const [force, setForce] = React.useState(false);

  const h = statement.data?.header;
  const w = withdrawable.data;
  const moves = statement.data?.movements ?? [];
  const totals = summarizeMovements(moves);

  const feeCents = w?.withdrawal_fee_cents ?? 0;
  const maxCents = w?.max_withdraw_cents ?? 0;
  // Botão desabilitado sem explicação é botão quebrado: o tooltip diz por que não há o que sacar.
  const maxReason = maxCents <= 0 ? maxWithdrawReason(w, brl) : null;
  const amountCents = Math.round((amount ?? 0) * 100);

  async function confirmarSaque() {
    const cents = amountCents;
    if (cents <= 0) {
      toast.error("Informe o valor do saque.");
      return;
    }
    if (cents <= feeCents) {
      toast.error(`O saque precisa ser maior que a taxa de ${brl(feeCents)}.`);
      return;
    }
    if (w && cents > maxCents && !(canRefund && force)) {
      toast.error(`Disponível para saque é ${brl(maxCents)}.`);
      return;
    }
    try {
      const r = await withdraw.mutateAsync({ company_id: companyId, amount_cents: cents, force: canRefund && force });
      toast.success(`Saque pedido: ${brl(r.amount_cents)} caem na conta (taxa de ${brl(r.fee_cents)} descontada).`);
      setWithdrawOpen(false);
      setAmount(null);
      setForce(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao pedir o saque");
    }
  }

  if (statement.isLoading && !statement.data) return <Skeleton className="h-64 w-full" />;
  if (statement.isError) {
    return (
      <EmptyState
        title="Não deu pra abrir a conta"
        description={statement.error instanceof Error ? statement.error.message : "Tente de novo."}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="partner-account">
      {/* Recebedor negativo no gateway: a Pagar.me pede para nunca deixar, porque arrasta o saldo do
          master. Aparece para as duas audiências, cada uma com a consequência que é dela. */}
      {(() => {
        const alerta = negativeRecipientAlert(h?.available_cents, showGateway ? "manager" : "partner", brl);
        if (!alerta) return null;
        return (
          <div
            role="alert"
            data-testid="conta-negativa"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-body-sm text-ink"
          >
            <Warning className="mt-0.5 shrink-0 text-destructive" />
            <span className="text-pretty">{alerta}</span>
          </div>
        );
      })()}

      {/* Cabeçalho (E0.3.8): o disponível para saque é o NOSSO número (vendas liberadas pelo prazo,
          menos dívida e saques, limitado ao saldo real). O gateway aparece como referência. */}
      <div className={showGateway ? "grid gap-4 tablet:grid-cols-4" : "grid gap-4 tablet:grid-cols-3"}>
        <Card>
          <CardContent className="p-5">
            <div className="text-caption text-muted">Disponível para saque</div>
            <div className="text-display-sm text-ink" data-testid="conta-disponivel">
              {w ? brl(w.available_cents) : "…"}
            </div>
            {showGateway ? (
              <div className="text-caption text-muted" data-testid="conta-gateway">
                {h?.available_cents != null ? `no gateway ${brl(h.available_cents)}` : "gateway sem leitura"}
                {h?.balance_synced_at ? ` · lido em ${formatDateTime(h.balance_synced_at)}` : ""}
              </div>
            ) : (
              <div className="text-caption text-muted">liberado pelo prazo, já descontados dívida e saques</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-caption text-muted">Retido pelo prazo</div>
            <div className="text-display-sm text-ink" data-testid="conta-retido">{w ? brl(w.retained_cents) : "…"}</div>
            <div className="text-caption text-muted">
              {w ? `cada venda libera ${w.release_days} dias depois do pagamento` : ""}
            </div>
          </CardContent>
        </Card>
        {showGateway && (
          <Card>
            <CardContent className="p-5">
              <div className="text-caption text-muted">A liberar pelo gateway</div>
              <div className="text-display-sm text-ink">{h?.waiting_cents != null ? brl(h.waiting_cents) : "-"}</div>
              <div className="text-caption text-muted">
                cartão em 30 dias, PIX na hora · {h ? transferCycleLabel(h) : "-"}
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-5">
            <div className="text-caption text-muted">Dívida com a Movepark</div>
            <div className="text-display-sm text-ink" data-testid="conta-divida">{brl(h?.debt_cents ?? 0)}</div>
            <div className="text-caption text-muted">abate sozinha nas próximas vendas</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={monthKey} onValueChange={setMonthKey}>
            <SelectTrigger className="w-44" aria-label="Mês de referência">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-caption text-muted">
            entrou {brl(totals.in_cents)} · saiu {brl(totals.out_cents)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {showGateway && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              aria-label="Atualizar saldos do gateway"
            >
              <ArrowsClockwise className={refresh.isPending ? "animate-spin" : undefined} />
              {refresh.isPending ? "Lendo o gateway…" : "Atualizar saldos"}
            </Button>
          )}
          {canWithdraw && (
            <Button
              size="sm"
              onClick={() => setWithdrawOpen(true)}
              disabled={!w || (w.available_cents <= 0 && !canRefund) || w.recipient_missing || w.recipient_status !== "active"}
            >
              Repassar para o banco
            </Button>
          )}
        </div>
      </div>

      {moves.length === 0 ? (
        <EmptyState title="Sem movimentos no mês" description="Nada entrou nem saiu da conta neste período." />
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Movimento</TableHead>
                <TableHead>Reserva</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead className="text-right">Abatimento</TableHead>
                <TableHead className="text-right">No saldo</TableHead>
                <TableHead>Liberação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moves.map((m, i) => (
                <MovementRow key={`${m.kind}-${m.at}-${m.booking_code ?? i}`} m={m} canRefund={canRefund} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Controle de saques (E0.3.10): quando cai, se caiu, por que falhou. */}
      <WithdrawalsCard companyId={companyId} canReconcile={showGateway} />

      <Dialog open={withdrawOpen} onOpenChange={(o) => !o && setWithdrawOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Repassar para o banco</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {/* O custo do saque fica explícito antes de confirmar. A taxa NÃO é descontada do
                disponível: a Pagar.me cobra do saldo do recebedor no ato do saque, sempre do
                recebedor (não há como mandar para o master), e ela entra no razão como custo. */}
            <div className="rounded-md border border-hairline bg-surface-soft p-3 text-body-sm">
              <div className="flex justify-between">
                <span className="text-muted">Disponível para saque</span>
                <span className="text-ink" data-testid="saque-disponivel">{w ? brl(w.available_cents) : "…"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Taxa por saque</span>
                <span className="text-ink" data-testid="saque-taxa">{brl(feeCents)}</span>
              </div>
              <p className="mt-1 text-caption text-muted">
                A taxa é descontada do valor sacado, uma vez por saque. Quem saca toda hora paga mais;
                juntar em um saque paga uma taxa só.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="saque-valor">Valor a sacar</Label>
                <CurrencyInput id="saque-valor" value={amount} onChange={setAmount} />
              </div>
              {maxReason ? (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    {/* Botão disabled não recebe eventos de ponteiro; o span focável é o gatilho. */}
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-flex" data-testid="saque-maximo-bloqueado">
                        <Button type="button" variant="secondary" disabled>
                          Sacar o máximo
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-pretty">
                      {maxReason}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button type="button" variant="secondary" onClick={() => setAmount(maxCents / 100)}>
                  Sacar o máximo
                </Button>
              )}
            </div>
            {amountCents > 0 && (
              <p className="text-caption text-muted" data-testid="saque-resumo">
                Sai do saldo: {brl(amountCents)} · taxa: {brl(feeCents)} · cai na conta:{" "}
                <strong>{brl(Math.max(0, amountCents - feeCents))}</strong>
                {amountCents > maxCents && !(canRefund && force) ? " · acima do disponível" : ""}
              </p>
            )}
            {canRefund && (
              <label className="flex items-start gap-2 text-caption text-muted">
                <Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} aria-label="Passar do teto" />
                <span>Passar do disponível calculado (só a Movepark; o teto físico continua sendo o gateway).</span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setWithdrawOpen(false)} disabled={withdraw.isPending}>
                Cancelar
              </Button>
              <Button onClick={confirmarSaque} disabled={withdraw.isPending}>
                {withdraw.isPending ? "Pedindo…" : "Confirmar saque"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MovementRow({ m, canRefund }: { m: AccountMovement; canRefund: boolean }) {
  const tone = m.net_cents > 0 ? "text-success" : m.net_cents < 0 ? "text-error" : "text-muted";
  return (
    <TableRow>
      <TableCell className="text-muted">{formatDateTime(m.at)}</TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-ink">{MOVEMENT_LABEL[m.kind]}</span>
          {m.kind === "debt" && (
            <span className="text-caption text-muted">
              o gateway não tirou do seu saldo; virou dívida de {brl(m.debt_delta_cents)}
            </span>
          )}
          {m.kind === "refund" && m.origin === "partner" && (
            <span className="text-caption text-muted">o gateway debitou do seu saldo</span>
          )}
          {m.status && (m.kind === "withdrawal" || m.kind === "transfer_in" || m.kind === "settlement") && (
            <Badge tone="neutral" className="mt-0.5 w-fit">{STATUS_LABEL[m.status] ?? m.status}</Badge>
          )}
          {m.note && <span className="text-caption text-muted">{m.note}</span>}
        </div>
      </TableCell>
      <TableCell className="font-mono text-caption">{m.booking_code ?? "-"}</TableCell>
      <TableCell className="text-right">{m.gross_cents ? brl(m.gross_cents) : "-"}</TableCell>
      <TableCell className="text-right text-muted">{m.fee_cents ? `−${brl(m.fee_cents)}` : "-"}</TableCell>
      <TableCell className="text-right text-muted">
        {m.debt_recovered_cents ? `−${brl(m.debt_recovered_cents)}` : "-"}
      </TableCell>
      <TableCell className={`text-right ${tone}`} data-testid="mov-no-saldo">
        {m.net_cents === 0 ? "-" : m.net_cents > 0 ? `+${brl(m.net_cents)}` : `−${brl(-m.net_cents)}`}
      </TableCell>
      <TableCell className="text-caption text-muted">{releaseLabel(m, formatDate)}</TableCell>
      <TableCell className="text-right">
        {canRefund && m.kind === "sale" && m.booking_code && (
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/manager/bookings?q=${encodeURIComponent(m.booking_code)}`}>Estornar</Link>
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
