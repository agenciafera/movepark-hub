import { ArrowsClockwise } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { usePayoutWithdrawals, useReconcileWithdrawals } from "./api";
import {
  WITHDRAWAL_STATUS,
  countOpenWithdrawals,
  withdrawalLanding,
  withdrawalRequestedAt,
} from "./withdrawal.logic";

const brl = (cents: number) => formatBRL(cents / 100);

/**
 * Histórico e controle de saques (E0.3.10). Cada saque diz quando foi pedido, quanto vai ao banco,
 * a taxa, o status e quando cai (ou caiu, ou por que falhou). O mesmo card no Manager (todas as
 * empresas, em Repasses) e na conta de cada estacionamento (Manager e Operator).
 * `canReconcile` (hub_admin) mostra "Conferir no gateway", que relê os abertos agora.
 */
export function WithdrawalsCard({
  companyId,
  showCompany = false,
  canReconcile = false,
}: {
  companyId?: string;
  showCompany?: boolean;
  canReconcile?: boolean;
}) {
  const withdrawals = usePayoutWithdrawals(companyId);
  const reconcile = useReconcileWithdrawals();
  const rows = withdrawals.data ?? [];
  const abertos = countOpenWithdrawals(rows);

  async function conferir() {
    try {
      const r = await reconcile.mutateAsync();
      toast.success(
        r.withdrawals.checked === 0
          ? "Nenhum saque em aberto para conferir."
          : `${r.withdrawals.checked} saque(s) conferido(s), ${r.withdrawals.updated} mudou(aram) de status.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui conferir no gateway.");
    }
  }

  return (
    <Card data-testid="saques-card">
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Saques para o banco</CardTitle>
          <p className="text-caption text-muted">
            {abertos > 0
              ? `${abertos} em trânsito. Pedido até as 15h em dia útil cai no mesmo dia; depois, no próximo dia útil.`
              : "Pedido até as 15h em dia útil cai no mesmo dia; depois, no próximo dia útil."}
          </p>
        </div>
        {canReconcile && (
          <Button
            size="sm"
            variant="secondary"
            className="gap-1"
            onClick={conferir}
            disabled={reconcile.isPending}
            aria-label="Conferir saques no gateway"
          >
            <ArrowsClockwise className={reconcile.isPending ? "animate-spin" : undefined} />
            {reconcile.isPending ? "Conferindo…" : "Conferir no gateway"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {withdrawals.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-body-sm text-muted">Nenhum saque ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-hairline bg-canvas">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido em</TableHead>
                  {showCompany && <TableHead>Empresa</TableHead>}
                  <TableHead className="text-right">Vai ao banco</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Chega em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((w) => {
                  const st = WITHDRAWAL_STATUS[w.status] ?? { label: w.status, tone: "neutral" as const };
                  const landing = withdrawalLanding(w, formatDate);
                  return (
                    <TableRow key={w.id} data-testid={`saque-${w.id}`}>
                      <TableCell className="tabular-nums text-muted">
                        {formatDateTime(withdrawalRequestedAt(w))}
                      </TableCell>
                      {showCompany && (
                        <TableCell>
                          <Link
                            to={`/manager/companies/${w.company_id}/conta`}
                            className="text-mp-primary underline-offset-2 hover:underline"
                          >
                            {w.company?.name ?? w.company_id}
                          </Link>
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums text-ink">{brl(w.amount_cents)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted">{brl(w.fee_cents)}</TableCell>
                      <TableCell>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </TableCell>
                      <TableCell
                        className={landing.late ? "text-caption text-destructive" : "text-caption text-muted"}
                        data-testid={`saque-chega-${w.id}`}
                      >
                        {landing.text}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
