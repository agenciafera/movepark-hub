import { Warning } from "@phosphor-icons/react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Panel, PanelTitle } from "@/components/shared/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MarketingRfmOverview } from "@/types/domain";
import {
  FREQUENCIA_LINHAS,
  MINIMO_PARA_RFM_CONFIAVEL,
  RECENCIA_COLUNAS,
  baseSuficiente,
  celulaSegmento,
  participacao,
  rfmLabel,
  tomDaCelula,
  type TomDaCelula,
} from "./rfm.logic";

type Props = {
  data: MarketingRfmOverview | undefined;
  isLoading: boolean;
  onAbrirSegmento?: (segmento: string) => void;
};

const int = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR");

const TONS: Record<TomDaCelula, string> = {
  forte: "bg-violet-100 border-violet-300 text-violet-900",
  bom: "bg-emerald-50 border-emerald-200 text-emerald-900",
  morno: "bg-amber-50 border-amber-200 text-amber-900",
  risco: "bg-rose-50 border-rose-200 text-rose-900",
  frio: "bg-neutral-100 border-neutral-200 text-neutral-700",
  vazio: "bg-canvas border-dashed border-hairline text-muted-soft",
};

/**
 * Matriz Recência × Frequência, o coração visual da proposta de CRM.
 *
 * A célula é clicável (RF-006): o gestor bate o olho em "18% campeões" e abre quem são, sem
 * remontar as regras no construtor. Célula sem ninguém continua desenhada, em tracejado, porque o
 * buraco na matriz é informação: mostra para onde a base não está indo.
 */
export function RfmMatrix({ data, isLoading, onAbrirSegmento }: Props) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 tablet:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  const totals = data?.totals;
  if (!totals || totals.contacts === 0) {
    return (
      <EmptyState
        title="Nenhum contato no recorte"
        description="Troque o estacionamento no filtro, ou sincronize os contatos para trazer quem já reservou."
      />
    );
  }

  const porCelula = new Map<string, { contacts: number; revenue: number }>();
  for (const c of data?.matrix ?? []) {
    porCelula.set(`${c.f_score}-${c.r_score}`, { contacts: c.contacts, revenue: Number(c.revenue) });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 tablet:grid-cols-2 desktop:grid-cols-4">
        <Numero
          titulo="Clientes na base"
          valor={int(totals.customers)}
          apoio={`${int(totals.eligible)} entraram no cálculo RFM`}
        />
        <Numero
          titulo="Ticket médio"
          valor={formatBRL(totals.avg_ticket)}
          apoio={`${totals.bookings_per_customer} reservas por cliente`}
        />
        <Numero titulo="LTV médio" valor={formatBRL(totals.avg_ltv)} apoio="receita por cliente" />
        <Numero
          titulo="Alto valor em risco"
          valor={int(data?.opportunities.alto_valor_em_risco)}
          apoio="M alto e recência caindo"
          destaque
        />
      </div>

      {!baseSuficiente(totals.eligible) && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <Warning className="mt-0.5 size-5 shrink-0 text-amber-700" weight="fill" />
          <div className="text-body-sm text-amber-900">
            <p className="font-medium">Base pequena demais para o rótulo valer.</p>
            <p className="mt-1">
              O score é por quintil da própria base, então ele sempre preenche as cinco faixas.
              Com {int(totals.eligible)} cliente(s) elegíveis, "campeão" quer dizer "o melhor entre
              poucos", e não cliente de alto valor. A leitura passa a se sustentar a partir de{" "}
              {MINIMO_PARA_RFM_CONFIAVEL} clientes com compra.
            </p>
          </div>
        </div>
      )}

      <Panel>
        <PanelTitle aside={`janela de ${data?.window_days} dias`}>
          Recência × Frequência
        </PanelTitle>
        <p className="mt-1.5 text-body-sm text-muted">
          Clique numa célula para ver quem está nela. O valor monetário entra como terceira
          dimensão: dentro da célula, ele decide quem se atende primeiro.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-[130px]" />
                {RECENCIA_COLUNAS.map((col) => (
                  <th
                    key={col.score}
                    className="pb-1 text-center text-caption font-medium text-muted-soft"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FREQUENCIA_LINHAS.map((linha) => (
                <tr key={linha.label}>
                  <th className="pr-2 text-right align-middle text-caption font-medium text-muted-soft">
                    {linha.label}
                  </th>
                  {RECENCIA_COLUNAS.map((col) => {
                    // A linha "Baixa" cobre F2 e F1: soma as duas para não esconder metade.
                    const somados = linha.scores.reduce(
                      (acc, f) => {
                        const cel = porCelula.get(`${f}-${col.score}`);
                        return {
                          contacts: acc.contacts + (cel?.contacts ?? 0),
                          revenue: acc.revenue + (cel?.revenue ?? 0),
                        };
                      },
                      { contacts: 0, revenue: 0 },
                    );
                    const segmento = celulaSegmento(linha.scores[0], col.score);
                    const tom = tomDaCelula(linha.scores[0], col.score, somados.contacts);
                    const vazia = somados.contacts === 0;
                    return (
                      <td key={col.score} className="p-0">
                        <button
                          type="button"
                          disabled={vazia}
                          onClick={() => onAbrirSegmento?.(segmento)}
                          className={cn(
                            "flex h-[86px] w-full flex-col items-center justify-center gap-0.5 rounded-md border px-2 transition-colors",
                            TONS[tom],
                            !vazia && "hover:brightness-95",
                            vazia && "cursor-default",
                          )}
                        >
                          <span className="text-caption-sm font-medium leading-tight">
                            {rfmLabel(segmento)}
                          </span>
                          <span className="text-display-sm tabular-nums leading-none">
                            {somados.contacts}
                          </span>
                          {!vazia && (
                            <span className="text-caption-sm tabular-nums opacity-75">
                              {formatBRL(somados.revenue)}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 desktop:grid-cols-[3fr_2fr]">
        <Panel>
          <PanelTitle aside={`${int(totals.eligible)} elegíveis`}>Distribuição RFM</PanelTitle>
          <div className="mt-5 flex flex-col gap-3">
            {(data?.by_segment ?? []).map((s) => {
              const pct = participacao(s.contacts, totals.eligible);
              return (
                <button
                  key={s.segment}
                  type="button"
                  onClick={() => onAbrirSegmento?.(s.segment)}
                  className="group flex flex-col gap-1 rounded-md px-1 py-1 text-left hover:bg-surface-soft"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-body-sm font-medium text-ink">
                      {rfmLabel(s.segment)}
                    </span>
                    <span className="text-body-sm tabular-nums text-muted">
                      {int(s.contacts)} · {pct}% · {formatBRL(s.revenue)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
                    <div
                      className="h-full rounded-full bg-mp-primary"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <PanelTitle>Oportunidades</PanelTitle>
          <p className="mt-1.5 text-body-sm text-muted">
            Onde está o dinheiro parado na base, agora.
          </p>
          <div className="mt-5 flex flex-col gap-4">
            <Oportunidade
              valor={int(data?.opportunities.alto_valor_em_risco)}
              rotulo="alto valor entrando em risco"
            />
            <Oportunidade
              valor={int(data?.opportunities.proximos_do_ciclo)}
              rotulo="próximos do ciclo de retorno"
            />
            <Oportunidade
              valor={int(data?.opportunities.novos_para_segunda)}
              rotulo="novos elegíveis para a segunda reserva"
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Oportunidade({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-display-xl tabular-nums leading-none text-mp-primary">{valor}</span>
      <span className="text-body-sm text-muted">{rotulo}</span>
    </div>
  );
}

function Numero({
  titulo,
  valor,
  apoio,
  destaque,
}: {
  titulo: string;
  valor: string;
  apoio?: string;
  destaque?: boolean;
}) {
  return (
    <Panel className={cn(destaque && "ring-1 ring-inset ring-mp-primary/25")}>
      <PanelTitle>{titulo}</PanelTitle>
      <div
        className={cn(
          "mt-4 whitespace-nowrap text-display-xl tabular-nums leading-none",
          destaque ? "text-mp-primary" : "text-ink",
        )}
      >
        {valor}
      </div>
      {apoio && <div className="mt-1.5 text-body-sm text-muted">{apoio}</div>}
    </Panel>
  );
}
