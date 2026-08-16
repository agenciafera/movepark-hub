import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatBRL } from "@/lib/format";
import type { MarketingFunnel } from "@/types/domain";
import { share, stepConversion } from "./cohorts";

type Props = {
  data: MarketingFunnel | undefined;
  isLoading: boolean;
};

/**
 * Funil de conversão.
 *
 * Os degraus são só o que os dados sustentam: reserva criada, paga, check-in e estadia concluída.
 * Não existe degrau de "visitas" porque o Hub não grava evento de sessão, e inventar um número de
 * topo faria toda a taxa abaixo dele virar ficção. O clique de saída para o site do parceiro
 * aparece como número próprio, à parte, porque é outra jornada.
 *
 * Cada taxa é sobre o degrau ANTERIOR, não sobre o topo: o que interessa é onde a pessoa desiste.
 */
export function ConversionFunnel({ data, isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-72 w-full" />;

  const steps = data?.steps ?? [];
  const topo = steps[0]?.count ?? 0;

  if (!data || topo === 0) {
    return (
      <EmptyState
        title="Sem reservas no período"
        description="Nada para medir neste recorte. Ajuste o período ou o estacionamento."
      />
    );
  }

  return (
    <div className="grid gap-4 desktop:grid-cols-3">
      <Card className="desktop:col-span-2">
        <CardContent className="flex flex-col gap-4 p-4">
          <div>
            <h3 className="font-medium text-body text-ink">Funil de conversão</h3>
            <p className="text-sm text-muted">
              Cada percentual é sobre o degrau logo acima, que é onde a desistência aparece.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {steps.map((step, i) => {
              const larguraPct = share(step.count, topo);
              const conversao = stepConversion(steps, i);
              const perdaAbsoluta = i > 0 ? (steps[i - 1]?.count ?? 0) - step.count : 0;
              return (
                <div key={step.key} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{step.label}</span>
                    <span className="text-sm tabular-nums text-muted">
                      {step.count}
                      {i > 0 && ` · ${conversao}% do passo anterior`}
                    </span>
                  </div>
                  <div className="h-8 w-full overflow-hidden rounded-md bg-surface-soft">
                    <div
                      className="flex h-full items-center rounded-md bg-primary px-2 text-xs font-medium text-white"
                      style={{ width: `${Math.max(larguraPct, 3)}%` }}
                    >
                      {larguraPct}%
                    </div>
                  </div>
                  {i > 0 && perdaAbsoluta > 0 && (
                    <span className="text-xs text-muted">
                      {perdaAbsoluta} não chegaram aqui.
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <h3 className="font-medium text-body text-ink">Onde a reserva morreu</h3>
            <Linha rotulo="Expiraram sem pagar" valor={data.losses.expiradas} />
            <Linha rotulo="Canceladas" valor={data.losses.canceladas} />
            <Linha rotulo="Não apareceram" valor={data.losses.no_show} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <h3 className="font-medium text-body text-ink">Quem comprou</h3>
            <Linha rotulo="Clientes novos" valor={data.new_vs_returning?.new ?? 0} />
            <Linha rotulo="Voltaram a comprar" valor={data.new_vs_returning?.returning ?? 0} />
            <div className="mt-1 border-t border-hairline pt-2">
              <Linha rotulo="Receita no período" valor={formatBRL(data.revenue)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <h3 className="font-medium text-body text-ink">Saíram para o parceiro</h3>
            <span className="text-2xl font-semibold tabular-nums text-ink">{data.exit_clicks}</span>
            <span className="text-xs text-muted">
              Cliques para reservar no site da unidade. Essa reserva não nasce no Hub, então ela
              não entra no funil acima.
            </span>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm text-muted">{rotulo}</span>
      <span className="text-sm font-medium tabular-nums text-ink">{valor}</span>
    </div>
  );
}
