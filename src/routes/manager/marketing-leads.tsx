import * as React from "react";
import { CornersIn, CornersOut, Kanban, ListBullets, MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useManagerFilters } from "@/features/manager-filters/context";
import { ManagerFilterBar } from "@/features/manager-filters/ManagerFilterBar";
import { useFullscreen } from "@/components/shared/useFullscreen";
import { LeadKanban } from "@/features/marketing/LeadKanban";
import { LeadTable } from "@/features/marketing/LeadTable";
import {
  useLeads,
  useLeadsRealtime,
  useMoveLead,
  usePipelines,
  useSaveColumnPrefs,
} from "@/features/marketing/api";
import type { LeadColumnKey } from "@/features/marketing/leadColumns.logic";
import { cn } from "@/lib/utils";

/**
 * Leads do consumidor: o mesmo conjunto em duas visões, kanban e lista.
 *
 * O filtro de estacionamento da barra vale nas duas, porque a pergunta que abre a tela costuma ser
 * "quem está no funil do Confins", não "quem está no funil".
 */
export default function ManagerMarketingLeads() {
  const { scopedLocationIds } = useManagerFilters();
  const pipelines = usePipelines();
  const [pipelineId, setPipelineId] = React.useState<string>("");
  const [visao, setVisao] = React.useState<"kanban" | "lista">("kanban");
  const [busca, setBusca] = React.useState("");
  const [buscaAplicada, setBuscaAplicada] = React.useState("");

  // Primeiro pipeline (o padrão do seed) assim que a lista chega.
  React.useEffect(() => {
    if (!pipelineId && pipelines.data?.length) {
      const padrao = pipelines.data.find((p) => p.is_default) ?? pipelines.data[0];
      setPipelineId(padrao.id);
    }
  }, [pipelines.data, pipelineId]);

  // O quadro acompanha o checkout: o gatilho do banco move o cartão quando a reserva muda de
  // status, e o canal do Realtime avisa a tela. Sem isto, o operador só veria o movimento ao
  // recarregar, que é justamente quando a informação já não vale.
  useLeadsRealtime();

  // Tela cheia: com cinco colunas de 288px, um notebook corta a ultima, e o quadro e justamente
  // a tela em que se quer ver o funil inteiro de uma vez.
  const { fullscreen, alternar, sair } = useFullscreen();

  const pipeline = pipelines.data?.find((p) => p.id === pipelineId);
  const leads = useLeads(pipelineId, scopedLocationIds, buscaAplicada);
  const mover = useMoveLead();
  const salvarColunas = useSaveColumnPrefs();

  function aplicarBusca(e: React.FormEvent) {
    e.preventDefault();
    setBuscaAplicada(busca);
  }

  const barra = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={pipelineId} onValueChange={setPipelineId}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Pipeline" />
        </SelectTrigger>
        <SelectContent>
          {(pipelines.data ?? []).map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <form onSubmit={aplicarBusca} className="flex items-center gap-2">
        <div className="relative">
          <MagnifyingGlass className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, e-mail ou telefone"
            className="w-[240px] pl-8"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Buscar
        </Button>
      </form>

      <span className="ml-auto flex items-center gap-1.5 text-caption-sm text-muted">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        ao vivo
      </span>

      <div className="flex items-center gap-1 rounded-md border border-hairline p-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={visao === "kanban"}
          className={cn(visao === "kanban" && "bg-surface-soft")}
          onClick={() => setVisao("kanban")}
        >
          <Kanban className="mr-2 size-4" />
          Kanban
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={visao === "lista"}
          className={cn(visao === "lista" && "bg-surface-soft")}
          onClick={() => setVisao("lista")}
        >
          <ListBullets className="mr-2 size-4" />
          Lista
        </Button>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={alternar}
        aria-pressed={fullscreen}
        title={fullscreen ? "Sair da tela cheia (Esc)" : "Tela cheia"}
        aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
      >
        {fullscreen ? <CornersIn className="size-4" /> : <CornersOut className="size-4" />}
      </Button>
    </div>
  );

  const quadro = pipelines.isLoading ? (
    <Skeleton className="h-96 w-full" />
  ) : !pipeline ? (
    <EmptyState
      title="Nenhum pipeline cadastrado"
      description="O pipeline de consumidor vem no seed da migration."
    />
  ) : visao === "kanban" ? (
    <LeadKanban
      stages={pipeline.stages}
      leads={leads.data ?? []}
      isLoading={leads.isLoading}
      fullscreen={fullscreen}
      onMove={(leadId, stageId) =>
        mover.mutate(
          { leadId, stageId },
          {
            onError: (e) =>
              toast.error(e instanceof Error ? e.message : "Não deu para mover o lead."),
          },
        )
      }
    />
  ) : (
    <LeadTable
      leads={leads.data ?? []}
      isLoading={leads.isLoading}
      savedColumns={pipeline.column_prefs}
      onSaveColumns={(columns: LeadColumnKey[]) =>
        salvarColunas.mutate(
          { pipelineId: pipeline.id, columns },
          {
            onError: (e) =>
              toast.error(e instanceof Error ? e.message : "Não deu para salvar as colunas."),
          },
        )
      }
    />
  );

  if (fullscreen) {
    // Sai do shell do Manager: a sidebar e o cabeçalho são a largura que falta para a última
    // coluna do kanban aparecer.
    return (
      <div className="fixed inset-0 z-50 flex flex-col gap-3 bg-canvas p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h1 className="font-semibold text-body text-ink">Leads</h1>
            <span className="text-caption-sm text-muted">quadro em tela cheia</span>
          </div>
          <Button variant="ghost" size="sm" onClick={sair}>
            Sair da tela cheia
          </Button>
        </div>
        {barra}
        <div className="min-h-0 flex-1">{quadro}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leads"
        description="Espelha o checkout ao vivo: entra quando a reserva começa e anda sozinho até a compra ou o abandono."
        actions={<ManagerFilterBar showPeriod={false} />}
      />
      {barra}
      {quadro}
    </div>
  );
}
