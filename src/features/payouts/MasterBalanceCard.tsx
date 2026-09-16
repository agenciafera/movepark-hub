import { Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateTime } from "@/lib/format";
import { useGatewayMasterBalance, useSetRefundHybrid } from "./api";
import { useAutoRefreshBalances } from "./useAutoRefreshBalances";

const brl = (cents: number) => formatBRL(cents / 100);

/**
 * Saldo do master no gateway contra o colchão (E0.3.5, decisão 6). Estornar exige saldo no
 * master, senão a Pagar.me recusa e o cancelamento cai na fila manual. O saldo vem do cron
 * (`refresh-recipients`, recuo de 1h); o piso vem de `app_setting.pagarme_master_float_cents`.
 */
export function MasterBalanceCard() {
  const { data, isLoading } = useGatewayMasterBalance();
  const setHybrid = useSetRefundHybrid();
  // Tempo real: lê o gateway ao abrir e no botão; o cron fica de reserva.
  const refresh = useAutoRefreshBalances();
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data) return null;

  const saldo = data.balance;
  const abaixo = !!saldo && data.float_cents > 0 && saldo.available_cents < data.float_cents;

  async function alternarHibrido(ligar: boolean) {
    try {
      await setHybrid.mutateAsync(ligar);
      toast.success(
        ligar
          ? "Estorno híbrido ligado: o gateway debita o parceiro quando ele tem saldo"
          : "Estorno híbrido desligado: todo estorno sai do master",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

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
              a liberar {brl(saldo.waiting_cents)} · lido em {formatDateTime(saldo.synced_at)}
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 -ml-2 gap-1"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            aria-label="Atualizar saldos do gateway"
          >
            <ArrowsClockwise className={refresh.isPending ? "animate-spin" : undefined} />
            {refresh.isPending ? "Lendo o gateway…" : "Atualizar saldos"}
          </Button>
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
        {/* E0.3.6: com o híbrido, o estorno de venda com split sai do recebedor do parceiro quando o
            saldo disponível dele cobre o líquido que recebeu; senão o master absorve e vira dívida,
            como antes. Nasce desligado; liga depois de um teste. */}
        <div className="flex items-start gap-3 tablet:max-w-xs">
          <Switch
            aria-label="Estorno híbrido"
            checked={data.refund_hybrid_enabled}
            disabled={setHybrid.isPending}
            onCheckedChange={alternarHibrido}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-body-sm text-ink">Estorno híbrido</span>
            <span className="text-caption text-muted">
              Quando o parceiro tem saldo no gateway, o estorno sai dele e não vira dívida.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
