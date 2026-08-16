import * as React from "react";
import { Kanban, ListBullets, MagnifyingGlass } from "@phosphor-icons/react";
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
import { LeadKanban } from "@/features/marketing/LeadKanban";
import { LeadTable } from "@/features/marketing/LeadTable";
import { useLeads, useMoveLead, usePipelines, useSaveColumnPrefs } from "@/features/marketing/api";
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

  const pipeline = pipelines.data?.find((p) => p.id === pipelineId);
  const leads = useLeads(pipelineId, scopedLocationIds, buscaAplicada);
  const mover = useMoveLead();
  const salvarColunas = useSaveColumnPrefs();

  function aplicarBusca(e: React.FormEvent) {
    e.preventDefault();
    setBuscaAplicada(busca);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leads"
        description="O funil de quem ainda vai reservar e de quem já é cliente, por estacionamento."
        actions={<ManagerFilterBar showPeriod={false} />}
      />

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

        <div className="ml-auto flex items-center gap-1 rounded-md border border-hairline p-0.5">
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
      </div>

      {pipelines.isLoading ? (
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
      )}
    </div>
  );
}
