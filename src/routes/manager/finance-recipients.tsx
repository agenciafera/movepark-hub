import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowsClockwise, Warning } from "@phosphor-icons/react";
import {
  usePayoutOwed,
  useRecipientsOverview,
  useSetCompanyGatewaySplit,
  useSyncRecipient,
} from "@/features/payouts/api";
import { useAutoRefreshBalances } from "@/features/payouts/useAutoRefreshBalances";
import { formatBRL, formatDateTime } from "@/lib/format";
import { payoutStatusLabel, payoutStatusTone } from "@/features/payouts/status";
import { PayoutKycDialog } from "@/features/payouts/PayoutKycDialog";
import { PayoutSettingsDialog } from "@/features/payouts/PayoutSettingsDialog";
import {
  type RecipientOverviewRow,
  buildRecipientOverview,
  latestBalanceSync,
  negativeRecipients,
  summarizeRecipients,
} from "./finance-recipients.logic";

export default function ManagerFinanceRecipients() {
  const { data, isLoading } = useRecipientsOverview();
  // Tempo real (16/09/2026): saldo do gateway lido ao abrir e no botão; "a repassar" vem do razão.
  const refresh = useAutoRefreshBalances();
  const owed = usePayoutOwed();
  const sync = useSyncRecipient();
  const setSplit = useSetCompanyGatewaySplit();
  const [onlyPending, setOnlyPending] = React.useState(false);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);
  const [kyc, setKyc] = React.useState<{ id: string; name: string } | null>(null);
  const [payoutId, setPayoutId] = React.useState<string | null>(null);

  const rows = React.useMemo(() => buildRecipientOverview(data ?? []), [data]);
  const summary = React.useMemo(() => summarizeRecipients(rows), [rows]);
  const visible = onlyPending ? rows.filter((r) => r.needsAttention) : rows;
  const owedByCompany = React.useMemo(
    () => new Map((owed.data ?? []).map((o) => [o.company_id, o])),
    [owed.data],
  );
  const lidoEm = latestBalanceSync(rows);
  const negativos = React.useMemo(() => negativeRecipients(rows), [rows]);
  const brl = (cents: number) => formatBRL(cents / 100);

  async function run(row: RecipientOverviewRow, action: "create" | "refresh") {
    setSyncingId(row.companyId);
    try {
      const res = await sync.mutateAsync({ company_id: row.companyId, action });
      toast.success(
        action === "create" ? "Recebedor criado no gateway" : "Status do recebedor atualizado",
      );
      if (res.status === "action_required") {
        toast.warning("O gateway pediu verificação (KYC). Veja as pendências.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao sincronizar recebedor");
    } finally {
      setSyncingId(null);
    }
  }

  async function alternarSplit(row: RecipientOverviewRow) {
    try {
      await setSplit.mutateAsync({ company_id: row.companyId, enabled: !row.splitEnabled });
      toast.success(
        row.splitEnabled
          ? `${row.companyName} voltou para a custódia.`
          : `${row.companyName} passou a vender com split.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui mudar o split.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recebedores"
        description="Status de cada empresa no gateway de pagamento (Pagar.me) e criação/manutenção do recebedor para o split."
      />

      {/* Recebedor negativo: a Pagar.me pede para nunca deixar, porque arrasta o saldo do master e
          pode travar estorno. Fica no topo até as vendas da empresa cobrirem o buraco. */}
      {negativos.length > 0 && (
        <div
          role="alert"
          data-testid="recebedores-negativos"
          className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-body-sm text-ink"
        >
          <Warning className="mt-0.5 shrink-0 text-destructive" />
          <div className="flex flex-col gap-1">
            <div className="font-medium">
              {negativos.length === 1
                ? `1 recebedor negativo na Pagar.me, ${brl(summary.negativeCents)} saindo do master`
                : `${negativos.length} recebedores negativos na Pagar.me, ${brl(summary.negativeCents)} saindo do master`}
            </div>
            <div className="text-pretty text-muted">
              Recebedor negativo arrasta o saldo da conta inteira e pode travar estorno. As próximas
              vendas de cada empresa cobrem o buraco antes de liberar saque.
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {negativos.map((r) => (
                <Link
                  key={r.companyId}
                  to={`/manager/companies/${r.companyId}/conta`}
                  className="text-mp-primary underline-offset-2 hover:underline"
                >
                  {r.companyName}: {brl(r.balance?.availableCents ?? 0)}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 tablet:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="text-caption text-muted">Empresas</div>
            <div className="text-display-sm text-ink">{summary.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-caption text-muted">Aptas a receber</div>
            <div className="text-display-sm text-success">{summary.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-caption text-muted">Precisam de atenção</div>
            <div className="text-display-sm text-mp-primary">{summary.needsAttention}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-body-sm text-muted">
          “Precisa de atenção” = empresa publicada que ainda não está apta a receber — o checkout dela
          falha sem recebedor ativo.
        </p>
        <div className="flex items-center gap-2">
          {lidoEm && (
            <span className="text-caption text-muted">saldos lidos em {formatDateTime(lidoEm)}</span>
          )}
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
          <Button
            size="sm"
            variant={onlyPending ? "primary" : "secondary"}
            onClick={() => setOnlyPending((v) => !v)}
          >
            {onlyPending ? "Mostrar todas" : "Só pendências"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={onlyPending ? "Nenhuma pendência" : "Sem empresas"}
          description={
            onlyPending
              ? "Todas as empresas publicadas estão aptas a receber."
              : "Nenhuma empresa cadastrada."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Recebedor</TableHead>
                <TableHead>ID no gateway</TableHead>
                <TableHead>Split</TableHead>
                <TableHead className="text-right">Saldo no gateway</TableHead>
                <TableHead className="text-right">A repassar</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const busy = syncingId === row.companyId && sync.isPending;
                return (
                  <TableRow key={row.companyId} className={row.needsAttention ? "bg-surface-soft" : ""}>
                    <TableCell className="text-ink">
                      <div className="font-medium">{row.companyName}</div>
                      {!row.hasKyc && (
                        <div className="mt-0.5 text-caption text-warning">
                          KYC pendente: preencha os dados antes de criar
                        </div>
                      )}
                      {row.requirements.length > 0 && (
                        <div className="mt-0.5 text-caption text-warning">
                          {row.requirements.length} pendência(s) do gateway
                        </div>
                      )}
                      {row.kycUrl && (
                        <a
                          href={row.kycUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-caption text-accent underline"
                        >
                          Link de verificação
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone={payoutStatusTone[row.recipientStatus]}>
                        {payoutStatusLabel[row.recipientStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-caption text-muted">
                      {row.externalRecipientId ?? "-"}
                    </TableCell>
                    <TableCell>
                      {/* E0.3.5: quem está marcado vende com split e entra no razão de dívida; quem
                          não está segue em custódia. Só liga com recebedor ativo e reconhecido. */}
                      {row.splitEnabled ? (
                        <div className="flex items-center gap-2">
                          <Badge tone="confirmed">Com split</Badge>
                          <Button size="sm" variant="ghost" onClick={() => alternarSplit(row)} disabled={setSplit.isPending}>
                            Desligar
                          </Button>
                        </div>
                      ) : row.recipientMissing ? (
                        <Badge tone="cancelled">Recebedor não existe no gateway</Badge>
                      ) : row.hasRecipient && row.recipientStatus === "active" ? (
                        <div className="flex items-center gap-2">
                          <Badge tone="neutral">Custódia</Badge>
                          <Button size="sm" variant="outline" onClick={() => alternarSplit(row)} disabled={setSplit.isPending}>
                            Ligar split
                          </Button>
                        </div>
                      ) : (
                        <Badge tone="neutral">Custódia</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* O que a Pagar.me diz que o recebedor tem agora: disponível para saque e a
                          liberar (cartão, D+30). Sem leitura, a tela diz isso em vez de mostrar zero. */}
                      {row.balance ? (
                        <div className="flex flex-col items-end">
                          <span
                            className={row.negativeBalance ? "font-medium text-destructive" : "text-ink"}
                            data-testid={`saldo-${row.companyId}`}
                          >
                            {brl(row.balance.availableCents)}
                          </span>
                          {row.negativeBalance && (
                            <Badge tone="cancelled">Saldo negativo</Badge>
                          )}
                          {row.balance.waitingCents > 0 && (
                            <span className="text-caption text-muted">
                              a liberar {brl(row.balance.waitingCents)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-caption text-muted-soft">
                          {row.hasRecipient ? "sem leitura" : "-"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Do nosso razão: o que a Movepark ainda deve repassar (custódia) a esta
                          empresa. Com split ligado tende a zero, porque o gateway já dividiu. */}
                      {(() => {
                        const o = owedByCompany.get(row.companyId);
                        if (!o || o.available_cents <= 0) {
                          return <span className="text-caption text-muted-soft">-</span>;
                        }
                        return <span className="text-ink">{brl(o.available_cents)}</span>;
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {!row.hasKyc ? (
                          // Sem KYC não dá pra criar recebedor (a Edge exige company_payout_account).
                          <Button
                            size="sm"
                            onClick={() => setKyc({ id: row.companyId, name: row.companyName })}
                          >
                            Preencher KYC
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setKyc({ id: row.companyId, name: row.companyName })}
                            >
                              Editar KYC
                            </Button>
                            {!row.hasRecipient ? (
                              <Button size="sm" onClick={() => run(row, "create")} disabled={busy}>
                                {busy ? "Criando…" : "Criar recebedor"}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => run(row, "refresh")}
                                disabled={busy}
                              >
                                {busy ? "Sincronizando…" : "Sincronizar"}
                              </Button>
                            )}
                            {row.hasRecipient && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setPayoutId(row.companyId)}
                              >
                                Prazo de saque
                              </Button>
                            )}
                            {row.hasRecipient && (
                              <Button size="sm" variant="ghost" asChild>
                                <Link to={`/manager/companies/${row.companyId}/conta`}>Conta</Link>
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {kyc && (
        <PayoutKycDialog
          companyId={kyc.id}
          companyName={kyc.name}
          open={!!kyc}
          onOpenChange={(o) => !o && setKyc(null)}
        />
      )}
      {payoutId && (
        <PayoutSettingsDialog
          companyId={payoutId}
          open={!!payoutId}
          onOpenChange={(o) => !o && setPayoutId(null)}
        />
      )}
    </div>
  );
}
