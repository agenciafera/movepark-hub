import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatBRL } from "@/lib/format";
import type { MarketingFunnel } from "@/types/domain";
import { bandClipPath, funnelBands } from "./funnel.logic";

type Props = {
  data: MarketingFunnel | undefined;
  isLoading: boolean;
};

/**
 * Funil de conversão em trapézios empilhados.
 *
 * Os degraus são só o que os dados sustentam: reserva criada, paga, check-in e estadia concluída.
 * Não existe degrau de "visitas" porque o Hub não grava evento de sessão, e inventar um número de
 * topo faria toda a taxa abaixo dele virar ficção. O clique de saída para o site do parceiro
 * aparece como número próprio, à parte, porque é outra jornada.
 *
 * Cada percentual é sobre o degrau ANTERIOR, não sobre o topo: o que interessa é onde a pessoa
 * desiste. A perda aparece escrita entre uma faixa e outra, que é onde ela de fato acontece.
 *
 * Cor: rampa ordinal de uma cor só (tokens `--funnel-*`), porque os degraus têm ordem natural.
 * Geometria e regras de largura em `funnel.logic.ts`.
 */
export function ConversionFunnel({ data, isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-72 w-full" />;

  const steps = data?.steps ?? [];
  const bands = funnelBands(steps);

  if (!data || bands.length === 0) {
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

          <ol className="mx-auto flex w-full max-w-xl flex-col">
            {bands.map((band, i) => (
              <li key={band.key} className="flex flex-col">
                {/* A perda mora entre as faixas, que é onde ela acontece. */}
                {band.dropped > 0 && (
                  <div className="flex items-center justify-center gap-2 py-1">
                    <span className="h-px w-6 bg-hairline" aria-hidden />
                    <span className="text-caption-sm text-muted">
                      {band.dropped.toLocaleString("pt-BR")} não passaram daqui
                    </span>
                    <span className="h-px w-6 bg-hairline" aria-hidden />
                  </div>
                )}

                {/* A forma e o texto ficam em camadas separadas de propósito: com o texto dentro
                    do elemento recortado, o `clip-path` cortava o rótulo do último degrau no meio
                    ("24 · 77% do passo anteri"). O recorte vale só para a cor. */}
                <div
                  className="relative flex min-h-[74px] items-center justify-center px-4 text-center"
                  title={`${band.label}: ${band.count.toLocaleString("pt-BR")} (${band.shareOfTop}% do topo, ${band.conversion}% do passo anterior)`}
                >
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background: `var(--funnel-${band.tone + 1})`,
                      clipPath: bandClipPath(band),
                    }}
                  />
                  <div
                    className="relative flex flex-col gap-0.5"
                    style={{ color: `var(--funnel-fg-${band.tone + 1})` }}
                  >
                    <span className="text-body-sm font-semibold leading-tight">{band.label}</span>
                    <span className="text-caption-sm opacity-90">
                      <span className="font-bold tabular-nums">
                        {band.count.toLocaleString("pt-BR")}
                      </span>
                      {/* "do passo anterior" já está dito no subtítulo do card; repetir em toda
                          faixa só rouba a largura que o rótulo precisa. */}
                      {i > 0 && ` · ${band.conversion}%`}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <p className="text-center text-caption-sm text-muted">
            A largura acompanha o volume numa escala comprimida, para o rótulo caber até no último
            degrau. O número escrito em cada faixa é o valor exato.
          </p>
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
