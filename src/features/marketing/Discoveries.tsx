import { ArrowDown, ArrowUp, Info, Lightbulb, Minus } from "@phosphor-icons/react";
import { Panel, PanelTitle } from "@/components/shared/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MarketingDiscoveries, MarketingDiscovery } from "@/types/domain";

type Props = {
  data: MarketingDiscoveries | undefined;
  isLoading: boolean;
};

/**
 * Descobertas: o que a base está fazendo sem ninguém ter perguntado.
 *
 * A tela existe para inverter o fluxo do CRM. Hoje o gestor precisa imaginar o público antes de
 * conseguir encontrá-lo; aqui o banco varre a base e diz o que mudou.
 *
 * A regra de ouro é mostrar `sem_dados` com o mesmo destaque de um achado. Um detector sem
 * histórico que some da tela vira uma afirmação silenciosa de que está tudo bem, e é assim que
 * alguém decide sobre um sinal que nunca foi medido. Aqui ele aparece dizendo o que falta.
 */
export function Discoveries({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid gap-5 tablet:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const itens = data?.items ?? [];
  const achados = itens.filter((i) => i.status === "achado");
  const resto = itens.filter((i) => i.status !== "achado");

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelTitle aside={`comparando janelas de ${data?.window_days} dias`}>
          O que a base está dizendo
        </PanelTitle>
        <p className="mt-1.5 text-body-sm text-muted">
          {achados.length > 0
            ? `${achados.length} sinal(is) com dado suficiente para agir. Os demais dizem o que falta para poderem responder.`
            : "Nenhum sinal com dado suficiente ainda. Cada cartão abaixo diz exatamente o que falta."}{" "}
          Histórico disponível: {data?.history_days ?? 0} dias, em {data?.history_months ?? 0}{" "}
          mês(es).
        </p>
      </Panel>

      <div className="grid gap-5 tablet:grid-cols-2">
        {[...achados, ...resto].map((item) => (
          <Cartao key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

function Cartao({ item }: { item: MarketingDiscovery }) {
  const semDados = item.status === "sem_dados";
  const achado = item.status === "achado";
  const subiu = (item.delta_pct ?? 0) > 0;

  return (
    <Panel
      className={cn(
        "flex flex-col gap-3",
        achado && "ring-1 ring-inset ring-mp-primary/25",
        semDados && "border border-dashed border-hairline",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <PanelTitle>{item.title}</PanelTitle>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-caption-sm font-medium",
            achado && "border-violet-200 bg-violet-50 text-violet-700",
            item.status === "estavel" && "border-neutral-200 bg-neutral-100 text-neutral-600",
            semDados && "border-amber-200 bg-amber-50 text-amber-700",
          )}
        >
          {achado ? "achado" : item.status === "estavel" ? "estável" : "sem dados"}
        </span>
      </div>

      {semDados ? (
        <div className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-body-sm text-muted">{item.requirement}</p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-display-sm tabular-nums leading-none",
                achado ? "text-mp-primary" : "text-ink",
              )}
            >
              {item.metric}
            </span>
            {item.delta_pct !== undefined && item.delta_pct !== null && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-caption font-medium tabular-nums",
                  subiu ? "text-emerald-700" : "text-rose-700",
                )}
              >
                {item.delta_pct === 0 ? (
                  <Minus className="size-3" />
                ) : subiu ? (
                  <ArrowUp className="size-3" />
                ) : (
                  <ArrowDown className="size-3" />
                )}
                {Math.abs(item.delta_pct)}%
              </span>
            )}
          </div>
          <p className="text-body-sm text-body">{item.headline}</p>
        </>
      )}

      {item.detail && (
        <div className="flex gap-2 border-t border-hairline pt-3">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-soft" />
          <p className="text-caption text-muted">{item.detail}</p>
        </div>
      )}
    </Panel>
  );
}
