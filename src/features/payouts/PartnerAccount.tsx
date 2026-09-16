import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { MOVEMENT_LABEL, releaseLabel, summarizeMovements, transferCycleLabel, type AccountMovement } from "./account.logic";
import { recentMonths } from "./months.logic";
import { useAutoRefreshBalances } from "./useAutoRefreshBalances";

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
}: {
  companyId: string;
  /** hub_admin ou Dono (`payouts:write`): mostra o botão Repassar. */
  canWithdraw: boolean;
  /** Só hub_admin: "Estornar" leva ao cancelamento com estorno da reserva. */
  canRefund: boolean;
}) {
  const months = React.useMemo(() => recentMonths(12), []);
  const [monthKey, setMonthKey] = React.useState(months[0].value);
  const period = months.find((m) => m.value === monthKey) ?? months[0];
  const statement = usePartnerAccountStatement({ companyId, from: period.from, to: period.to });
  const refresh = useAutoRefreshBalances();
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
  const amountCents = Math.round((amount ?? 0) * 100);

  async function confirmarSaque() {
    const cents = amountCents;
    if (cents <= 0) {
      toast.error("Informe o valor do saque.");
      return;
    }
    if (w && cents > maxCents && !(canRefund && force)) {
      toast.error(`Dá para sacar até ${brl(maxCents)} (disponível menos a taxa de saque).`);
      return;
    }
    try {
      const r = await withdraw.mutateAsync({ company_id: companyId, amount_cents: cents, force: canRefund && force });
      toast.success(`Saque de ${brl(r.amount_cents)} pedido ao gateway (${STATUS_LABEL[r.status] ?? r.status}).`);
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
      {/* Cabeçalho (E0.3.8): o disponível para saque é o NOSSO número (vendas liberadas pelo prazo,
          menos dívida e saques, limitado ao saldo real). O gateway aparece como referência. */}
      <div className="grid gap-4 tablet:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-caption text-muted">Disponível para saque</div>
            <div className="text-display-sm text-ink" data-testid="conta-disponivel">
              {w ? brl(w.available_cents) : "…"}
            </div>
            <div className="text-caption text-muted">
              {h?.available_cents != null ? `no gateway ${brl(h.available_cents)}` : "gateway sem leitura"}
              {h?.balance_synced_at ? ` · lido em ${formatDateTime(h.balance_synced_at)}` : ""}
            </div>
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
        <Card>
          <CardContent className="p-5">
            <div className="text-caption text-muted">A liberar pelo gateway</div>
            <div className="text-display-sm text-ink">{h?.waiting_cents != null ? brl(h.waiting_cents) : "-"}</div>
            <div className="text-caption text-muted">
              cartão em 30 dias, PIX na hora · {h ? transferCycleLabel(h) : "-"}
            </div>
          </CardContent>
        </Card>
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

      <Dialog open={withdrawOpen} onOpenChange={(o) => !o && setWithdrawOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Repassar para o banco</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {/* O custo do saque fica explícito antes de confirmar: a Pagar.me cobra a taxa do saldo
                além do valor pedido, então o máximo que dá para pedir é o disponível menos a taxa. */}
            <div className="rounded-md border border-hairline bg-surface-soft p-3 text-body-sm">
              <div className="flex justify-between">
                <span className="text-muted">Disponível para saque</span>
                <span className="text-ink" data-testid="saque-disponivel">{w ? brl(w.available_cents) : "…"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Taxa por saque (Pagar.me)</span>
                <span className="text-ink" data-testid="saque-taxa">−{brl(feeCents)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-hairline pt-1">
                <span className="text-muted">Máximo que dá para sacar</span>
                <span className="text-ink" data-testid="saque-maximo">{brl(maxCents)}</span>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="saque-valor">Valor a sacar</Label>
                <CurrencyInput id="saque-valor" value={amount} onChange={setAmount} />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAmount(maxCents / 100)}
                disabled={maxCents <= 0}
              >
                Sacar o máximo
              </Button>
            </div>
            {amountCents > 0 && (
              <p className="text-caption text-muted" data-testid="saque-resumo">
                Cai na conta: <strong>{brl(amountCents)}</strong> · sai do saldo: {brl(amountCents + feeCents)}
                {amountCents > maxCents && !(canRefund && force) ? " · acima do máximo" : ""}
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
