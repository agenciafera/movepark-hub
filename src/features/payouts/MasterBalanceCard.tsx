import { Warning } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDate } from "@/lib/format";
import { useGatewayMasterBalance } from "./api";

const brl = (cents: number) => formatBRL(cents / 100);

/**
 * Saldo do master no gateway contra o colchão (E0.3.5, decisão 6). Estornar exige saldo no
 * master, senão a Pagar.me recusa e o cancelamento cai na fila manual. O saldo vem do cron
 * (`refresh-recipients`, recuo de 1h); o piso vem de `app_setting.pagarme_master_float_cents`.
 */
export function MasterBalanceCard() {
  const { data, isLoading } = useGatewayMasterBalance();
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data) return null;

  const saldo = data.balance;
  const abaixo = !!saldo && data.float_cents > 0 && saldo.available_cents < data.float_cents;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6 tablet:flex-row tablet:items-center tablet:justify-between">
        <div>
          <div className="text-caption text-muted">Saldo do master no gateway</div>
          <div className="text-display-sm text-ink">
            {saldo ? brl(saldo.available_cents) : "ainda não lido"}
          </div>
          {saldo && (
            <div className="text-caption text-muted">
              a liberar {brl(saldo.waiting_cents)} · lido em {formatDate(saldo.synced_at)}
            </div>
          )}
        </div>
        <div className="flex flex-col items-start gap-1 tablet:items-end">
          <div className="text-caption text-muted">Colchão para estornos</div>
          <div className="text-body text-ink">
            {data.float_cents > 0 ? brl(data.float_cents) : "não definido"}
          </div>
          {abaixo && (
            <Badge tone="cancelled" className="gap-1">
              <Warning />
              Abaixo do colchão: estorno pode ser recusado
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
