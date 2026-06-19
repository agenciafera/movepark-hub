import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/auth/context";
import {
  usePayoutBalance,
  usePayoutStatement,
  usePayoutWithdrawals,
  useRecipient,
} from "@/features/payouts/api";
import { payoutStatusLabel, payoutStatusTone } from "@/features/payouts/status";
import { formatBRL, formatDate } from "@/lib/format";

function recentMonths(n: number) {
  const out: { value: string; label: string; from: string; to: string }[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i + 1, 1));
    out.push({
      value: start.toISOString().slice(0, 7),
      label: format(start, "MMMM yyyy", { locale: ptBR }),
      from: start.toISOString(),
      to: end.toISOString(),
    });
  }
  return out;
}

const brl = (cents: number) => formatBRL(cents / 100);

const withdrawalStatus: Record<string, { label: string; tone: "pending" | "confirmed" | "cancelled" | "neutral" }> = {
  created: { label: "Solicitado", tone: "pending" },
  processing: { label: "Processando", tone: "pending" },
  paid: { label: "Pago", tone: "confirmed" },
  failed: { label: "Falhou", tone: "cancelled" },
  canceled: { label: "Cancelado", tone: "cancelled" },
};

export default function OperatorFinance() {
  const { effectiveCompanyIds } = useAuth();
  const companyId = effectiveCompanyIds[0];

  const months = React.useMemo(() => recentMonths(12), []);
  const [monthKey, setMonthKey] = React.useState(months[0].value);
  const period = months.find((m) => m.value === monthKey) ?? months[0];

  const recipient = useRecipient(companyId);
  const balance = usePayoutBalance(companyId);
  const statement = usePayoutStatement({
    from: period.from,
    to: period.to,
    companyId,
    includeLines: true,
  });
  const withdrawals = usePayoutWithdrawals(companyId);

  const company = statement.data?.companies?.[0] ?? null;
  const recStatus = recipient.data?.status;

  if (!companyId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Repasses" description="Extrato dos seus repasses." />
        <EmptyState title="Empresa não encontrada" description="Sua conta não está vinculada a um estacionamento." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Repasses"
        description="Quanto você recebe de cada reserva (líquido do split, já descontada a comissão da Movepark)."
      />

      {/* Saldo + status do recebedor */}
      <div className="grid gap-4 tablet:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="text-caption text-muted">Saldo a receber</div>
            {balance.isLoading ? (
              <Skeleton className="mt-1 h-8 w-28" />
            ) : (
              <div className="text-display-sm text-ink">{brl(balance.data?.balance_cents ?? 0)}</div>
            )}
            <div className="mt-1 text-caption text-muted">
              já transferido: {brl(balance.data?.withdrawn_cents ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="tablet:col-span-2">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <div className="text-caption text-muted">Status do recebimento</div>
              <div className="mt-1">
                {recStatus ? (
                  <Badge tone={payoutStatusTone[recStatus]}>{payoutStatusLabel[recStatus]}</Badge>
                ) : (
                  <span className="text-body-sm text-muted">recebedor ainda não configurado</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-caption text-muted">Saques diluem a taxa</div>
              <div className="text-body-sm text-body">transferência agregada (não por reserva)</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Extrato do mês */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle>Extrato do mês</CardTitle>
          <div className="w-48">
            <Select value={monthKey} onValueChange={setMonthKey}>
              <SelectTrigger>
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
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {statement.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !company ? (
            <EmptyState title="Sem repasses" description="Nenhum pagamento confirmado neste mês." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 tablet:grid-cols-4">
                <Kpi label="Bruto" value={brl(company.gross_partner_cents)} />
                <Kpi label="Estornos" value={company.refunded_partner_cents > 0 ? `−${brl(company.refunded_partner_cents)}` : "—"} />
                <Kpi label="Líquido a receber" value={brl(company.net_partner_cents)} strong />
                <Kpi label="Comissão Movepark" value={brl(company.movepark_commission_cents)} muted />
              </div>

              {(company.lines ?? []).length > 0 && (
                <div className="overflow-hidden rounded-md border border-hairline">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reserva</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Seu repasse</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(company.lines ?? []).map((l, i) => (
                        <TableRow key={`${l.booking_code}-${i}`}>
                          <TableCell className="text-ink">{l.booking_code}</TableCell>
                          <TableCell className="tabular-nums">{formatDate(l.event_at)}</TableCell>
                          <TableCell>
                            {l.status === "refunded" ? (
                              <Badge tone="cancelled">Estornada</Badge>
                            ) : (
                              <Badge tone="confirmed">Paga</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {l.status === "refunded" ? `−${brl(l.partner_cents)}` : brl(l.partner_cents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Histórico de saques */}
      <Card>
        <CardHeader>
          <CardTitle>Saques</CardTitle>
        </CardHeader>
        <CardContent>
          {withdrawals.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (withdrawals.data ?? []).length === 0 ? (
            <p className="text-body-sm text-muted">
              Nenhum saque ainda. As transferências para a sua conta são agregadas (diluindo a taxa de saque).
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-hairline">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(withdrawals.data ?? []).map((w) => {
                    const st = withdrawalStatus[w.status] ?? { label: w.status, tone: "neutral" as const };
                    return (
                      <TableRow key={w.id}>
                        <TableCell className="tabular-nums">{formatDate(w.paid_at ?? w.created_at)}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(w.amount_cents)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted">{brl(w.fee_cents)}</TableCell>
                        <TableCell>
                          <Badge tone={st.tone}>{st.label}</Badge>
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

      {/* NFs — depende da camada fiscal (E0.2) */}
      <Card>
        <CardHeader>
          <CardTitle>Notas fiscais</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-muted">
            Em breve: a nota do seu serviço e a da comissão da Movepark. Depende da camada fiscal (E0.2),
            em definição com a contabilidade.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div>
      <div className="text-caption text-muted">{label}</div>
      <div
        className={
          strong
            ? "text-title-lg text-ink"
            : muted
              ? "text-title-md text-mp-primary"
              : "text-title-md text-ink"
        }
      >
        {value}
      </div>
    </div>
  );
}
