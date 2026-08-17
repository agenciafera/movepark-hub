import * as React from "react";
import { CurrencyCircleDollar, Star } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MarketingLeadRow, MarketingPipelineStage } from "@/types/domain";
import { cohortLabel, cohortTone, toneClasses } from "./cohorts";
import { checkoutState, checkoutToneClasses } from "./leadCheckout.logic";

type Props = {
  stages: MarketingPipelineStage[];
  leads: MarketingLeadRow[];
  isLoading: boolean;
  onMove: (leadId: string, stageId: string) => void;
  /** Em tela cheia a coluna usa a altura da janela e rola por dentro. */
  fullscreen?: boolean;
};

/**
 * Kanban de leads com arrastar e soltar nativo (HTML5 drag-and-drop).
 *
 * Sem biblioteca de propósito: o projeto instala dependência com bun e o CI roda
 * `--frozen-lockfile` no Linux, então uma dep a mais por um recurso de uma tela só é risco de
 * build sem contrapartida (ver CLAUDE.md). O que a lib traria de bom aqui, reordenar dentro da
 * coluna, não é o que a tela precisa: o que importa é trocar de estágio.
 *
 * A troca é otimista e o servidor manda: `marketing_move_lead` é quem grava, registra na timeline
 * e fecha o lead quando a coluna é de ganho ou perda.
 */
export function LeadKanban({ stages, leads, isLoading, onMove, fullscreen = false }: Props) {
  const [arrastando, setArrastando] = React.useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-96 w-72 shrink-0" />
        ))}
      </div>
    );
  }

  if (stages.length === 0) {
    return <EmptyState title="Este pipeline não tem colunas" description="Crie ao menos uma." />;
  }

  return (
    <div
      className={cn(
        "flex gap-4 overflow-x-auto pb-2",
        fullscreen && "h-full items-start",
      )}
    >
      {stages.map((stage) => {
        const daColuna = leads.filter((l) => l.stage_id === stage.id);
        const valor = daColuna.reduce((soma, l) => soma + (l.value_cents ?? 0), 0) / 100;
        const ativa = colunaAlvo === stage.id;

        return (
          <section
            key={stage.id}
            aria-label={stage.name}
            className={cn(
              "flex w-72 shrink-0 flex-col gap-2 rounded-md border bg-surface-soft p-2 transition-colors",
              ativa ? "border-primary bg-primary/5" : "border-hairline",
              // Em tela cheia a coluna vai ate o rodape e rola por dentro: sem isso a coluna mais
              // cheia estica a pagina e as outras ficam com metros de vazio embaixo.
              fullscreen && "max-h-full",
            )}
            onDragOver={(e) => {
              // Sem o preventDefault o navegador recusa o drop e o cartão volta para a origem.
              e.preventDefault();
              setColunaAlvo(stage.id);
            }}
            onDragLeave={() => setColunaAlvo((atual) => (atual === stage.id ? null : atual))}
            onDrop={(e) => {
              e.preventDefault();
              const leadId = e.dataTransfer.getData("text/plain") || arrastando;
              setColunaAlvo(null);
              setArrastando(null);
              if (!leadId) return;
              const lead = leads.find((l) => l.id === leadId);
              // Soltar na mesma coluna não é movimento: gravaria uma linha de histórico à toa.
              if (!lead || lead.stage_id === stage.id) return;
              onMove(leadId, stage.id);
            }}
          >
            <header className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn("size-2 rounded-full", corDaBolinha(stage.color))}
                  aria-hidden
                />
                <h3 className="text-sm font-medium text-ink">{stage.name}</h3>
              </div>
              <span className="text-xs tabular-nums text-muted">{daColuna.length}</span>
            </header>
            {valor > 0 && (
              <span className="px-1 text-xs text-muted">{formatBRL(valor)} em jogo</span>
            )}

            <div className={cn("flex flex-col gap-2", fullscreen && "min-h-0 overflow-y-auto")}>
              {daColuna.map((lead) => (
                <article
                  key={lead.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", lead.id);
                    e.dataTransfer.effectAllowed = "move";
                    setArrastando(lead.id);
                  }}
                  onDragEnd={() => {
                    setArrastando(null);
                    setColunaAlvo(null);
                  }}
                  className={cn(
                    "cursor-grab rounded-md border border-hairline bg-canvas p-3 shadow-sm transition-opacity active:cursor-grabbing",
                    arrastando === lead.id && "opacity-40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {lead.display_name || lead.email || lead.phone || "Sem nome"}
                    </span>
                    {lead.subscription_candidate && (
                      <Star
                        weight="fill"
                        className="size-4 shrink-0 text-amber-500"
                        aria-label="Candidato a assinante"
                      />
                    )}
                  </div>

                  {lead.title && <p className="mt-0.5 text-xs text-muted">{lead.title}</p>}

                  {/* Estado do checkout: é o que faz o quadro valer em tempo real. Vem primeiro
                      porque um hold prestes a vencer manda mais que a coorte. */}
                  {(() => {
                    const checkout = checkoutState(lead);
                    if (!checkout) return null;
                    return (
                      <div className="mt-1.5 flex items-center gap-1">
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[11px] font-medium",
                            checkoutToneClasses(checkout.tone),
                          )}
                        >
                          {checkout.label}
                        </span>
                        {lead.booking_code && (
                          <span className="text-[11px] text-muted">{lead.booking_code}</span>
                        )}
                      </div>
                    );
                  })()}

                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {lead.cohort && (
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[11px] font-medium",
                          toneClasses(cohortTone(lead.cohort)),
                        )}
                      >
                        {cohortLabel(lead.cohort)}
                      </span>
                    )}
                    {lead.location_name && (
                      <span className="rounded-full border border-hairline bg-surface-soft px-1.5 py-0.5 text-[11px] text-muted">
                        {lead.location_name}
                      </span>
                    )}
                    {/* Cartão que saiu da sincronia: sem esse aviso, alguém estranharia por que
                        ele não acompanha mais a reserva. */}
                    {lead.booking_id && !lead.auto_synced && (
                      <span
                        className="rounded-full border border-hairline bg-surface-soft px-1.5 py-0.5 text-[11px] text-muted"
                        title="Movido na mão, então este cartão não segue mais o status da reserva."
                      >
                        movido na mão
                      </span>
                    )}
                  </div>

                  <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-muted">
                    <div className="flex items-center gap-1">
                      <dt className="sr-only">Reservas</dt>
                      <dd>{lead.bookings_count} reservas</dd>
                    </div>
                    <div className="flex items-center gap-1">
                      <CurrencyCircleDollar className="size-3" aria-hidden />
                      <dt className="sr-only">Total gasto</dt>
                      <dd className="tabular-nums">{formatBRL(lead.total_spent)}</dd>
                    </div>
                    {lead.days_since_last != null && (
                      <div className="col-span-2">
                        <dt className="sr-only">Dias desde a última compra</dt>
                        <dd>Última compra há {lead.days_since_last} dias</dd>
                      </div>
                    )}
                  </dl>
                </article>
              ))}

              {daColuna.length === 0 && (
                <p className="rounded-md border border-dashed border-hairline px-2 py-6 text-center text-xs text-muted">
                  Arraste um lead para cá
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function corDaBolinha(cor: string): string {
  switch (cor) {
    case "cyan":
      return "bg-cyan-500";
    case "violet":
      return "bg-violet-500";
    case "green":
      return "bg-emerald-500";
    case "amber":
      return "bg-amber-500";
    case "red":
      return "bg-rose-500";
    default:
      return "bg-neutral-400";
  }
}
