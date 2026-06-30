import * as React from "react";
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
import { useRecipientsOverview, useSyncRecipient } from "@/features/payouts/api";
import { payoutStatusLabel, payoutStatusTone } from "@/features/payouts/status";
import { PayoutKycDialog } from "@/features/payouts/PayoutKycDialog";
import {
  buildRecipientOverview,
  summarizeRecipients,
  type RecipientOverviewRow,
} from "./finance-recipients.logic";

export default function ManagerFinanceRecipients() {
  const { data, isLoading } = useRecipientsOverview();
  const sync = useSyncRecipient();
  const [onlyPending, setOnlyPending] = React.useState(false);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);
  const [kyc, setKyc] = React.useState<{ id: string; name: string } | null>(null);

  const rows = React.useMemo(() => buildRecipientOverview(data ?? []), [data]);
  const summary = React.useMemo(() => summarizeRecipients(rows), [rows]);
  const visible = onlyPending ? rows.filter((r) => r.needsAttention) : rows;

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recebedores"
        description="Status de cada empresa no gateway de pagamento (Pagar.me) e criação/manutenção do recebedor para o split."
      />

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
        <Button
          size="sm"
          variant={onlyPending ? "primary" : "secondary"}
          onClick={() => setOnlyPending((v) => !v)}
        >
          {onlyPending ? "Mostrar todas" : "Só pendências"}
        </Button>
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
        <div className="overflow-hidden rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Recebedor</TableHead>
                <TableHead>ID no gateway</TableHead>
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
                      {row.externalRecipientId ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
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
    </div>
  );
}
