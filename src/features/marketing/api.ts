import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  Json,
  MarketingCampaign,
  MarketingDiscoveries,
  MarketingFunnel,
  MarketingLeadRow,
  MarketingPipeline,
  MarketingPipelineStage,
  MarketingProfileMatrix,
  MarketingRfmContact,
  MarketingRfmOverview,
  MarketingSegment,
  MarketingSegmentContact,
  MarketingSegmentCount,
  MarketingSegmentPreview,
} from "@/types/domain";
import type { SegmentGroup } from "./segmentBuilder.logic";
import type { CampaignCanvas } from "./canvas.logic";

export const marketingKeys = {
  all: ["marketing"] as const,
  matrix: (locationIds?: string[]) => [...marketingKeys.all, "matrix", locationIds] as const,
  funnel: (from: string, to: string, locationIds?: string[]) =>
    [...marketingKeys.all, "funnel", from, to, locationIds] as const,
  pipelines: () => [...marketingKeys.all, "pipelines"] as const,
  leads: (pipelineId?: string, locationIds?: string[], search?: string) =>
    [...marketingKeys.all, "leads", pipelineId, locationIds, search] as const,
  segments: () => [...marketingKeys.all, "segments"] as const,
  segmentCounts: (locationIds?: string[]) =>
    [...marketingKeys.all, "segment-counts", locationIds] as const,
  segmentPreview: (definition: SegmentGroup, locationIds?: string[]) =>
    [...marketingKeys.all, "segment-preview", definition, locationIds] as const,
  segmentContacts: (definition: SegmentGroup, locationIds?: string[]) =>
    [...marketingKeys.all, "segment-contacts", definition, locationIds] as const,
  campaigns: () => [...marketingKeys.all, "campaigns"] as const,
  campaign: (id: string) => [...marketingKeys.all, "campaign", id] as const,
  messages: (campaignId: string) => [...marketingKeys.all, "messages", campaignId] as const,
  dispatchConfig: () => [...marketingKeys.all, "dispatch-config"] as const,
  rfm: (locationIds?: string[], windowDays?: number) =>
    [...marketingKeys.all, "rfm", locationIds, windowDays] as const,
  rfmContacts: (segment: string, locationIds?: string[]) =>
    [...marketingKeys.all, "rfm-contacts", segment, locationIds] as const,
  discoveries: (locationIds?: string[], windowDays?: number) =>
    [...marketingKeys.all, "discoveries", locationIds, windowDays] as const,
};

/** `undefined` quer dizer "todas as unidades": é o que as RPCs esperam para não filtrar. */
function locationArg(locationIds?: string[]) {
  return locationIds?.length ? { p_location_ids: locationIds } : {};
}

// ─── Matriz de perfis e funil ────────────────────────────────────────────────

export function useProfileMatrix(locationIds?: string[]) {
  return useQuery({
    queryKey: marketingKeys.matrix(locationIds),
    staleTime: 60_000,
    queryFn: async (): Promise<MarketingProfileMatrix> => {
      const { data, error } = await supabase.rpc("marketing_profile_matrix", {
        ...locationArg(locationIds),
      });
      if (error) throw error;
      return data as unknown as MarketingProfileMatrix;
    },
  });
}

export function useConversionFunnel(from: string, to: string, locationIds?: string[]) {
  return useQuery({
    queryKey: marketingKeys.funnel(from, to, locationIds),
    staleTime: 60_000,
    queryFn: async (): Promise<MarketingFunnel> => {
      const { data, error } = await supabase.rpc("marketing_conversion_funnel", {
        p_from: from,
        p_to: to,
        ...locationArg(locationIds),
      });
      if (error) throw error;
      return data as unknown as MarketingFunnel;
    },
  });
}

/** Recria os contatos a partir das reservas. Não mexe em consentimento nem em descadastro. */
export function useSyncContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("marketing_sync_contacts");
      if (error) throw error;
      return data as unknown as { inserted: number; updated: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}

// ─── Pipelines e leads ───────────────────────────────────────────────────────

export type PipelineWithStages = MarketingPipeline & { stages: MarketingPipelineStage[] };

export function usePipelines() {
  return useQuery({
    queryKey: marketingKeys.pipelines(),
    staleTime: 300_000,
    queryFn: async (): Promise<PipelineWithStages[]> => {
      const { data, error } = await supabase
        .from("marketing_pipeline")
        .select("*, stages:marketing_pipeline_stage(*)")
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        stages: [...(p.stages ?? [])].sort((a, b) => a.sort_order - b.sort_order),
      })) as PipelineWithStages[];
    },
  });
}

export function useLeads(pipelineId?: string, locationIds?: string[], search?: string) {
  return useQuery({
    queryKey: marketingKeys.leads(pipelineId, locationIds, search),
    enabled: Boolean(pipelineId),
    staleTime: 30_000,
    queryFn: async (): Promise<MarketingLeadRow[]> => {
      const { data, error } = await supabase.rpc("marketing_leads", {
        p_pipeline_id: pipelineId,
        ...locationArg(locationIds),
        ...(search?.trim() ? { p_search: search.trim() } : {}),
      });
      if (error) throw error;
      return (data ?? []) as unknown as MarketingLeadRow[];
    },
  });
}

export function useMoveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leadId: string; stageId: string; sortOrder?: number }) => {
      const { error } = await supabase.rpc("marketing_move_lead", {
        p_lead_id: input.leadId,
        p_stage_id: input.stageId,
        p_sort_order: input.sortOrder ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      pipelineId: string;
      stageId: string;
      contactId: string;
      locationId?: string | null;
      title?: string | null;
      valueCents?: number;
    }) => {
      const { error } = await supabase.from("marketing_lead").insert({
        pipeline_id: input.pipelineId,
        stage_id: input.stageId,
        contact_id: input.contactId,
        location_id: input.locationId ?? null,
        title: input.title ?? null,
        value_cents: input.valueCents ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}

/** Colunas escolhidas na visão de lista. Preferência de exibição, gravada no pipeline. */
export function useSaveColumnPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pipelineId: string; columns: string[] }) => {
      const { error } = await supabase
        .from("marketing_pipeline")
        .update({ column_prefs: input.columns })
        .eq("id", input.pipelineId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.pipelines() }),
  });
}

export function useSaveStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      pipelineId: string;
      stages: Array<{ id?: string; name: string; color: string; sort_order: number }>;
    }) => {
      for (const stage of input.stages) {
        if (stage.id) {
          const { error } = await supabase
            .from("marketing_pipeline_stage")
            .update({ name: stage.name, color: stage.color, sort_order: stage.sort_order })
            .eq("id", stage.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("marketing_pipeline_stage").insert({
            pipeline_id: input.pipelineId,
            name: stage.name,
            color: stage.color,
            sort_order: stage.sort_order,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}

// ─── Segmentos ───────────────────────────────────────────────────────────────

export function useSegments() {
  return useQuery({
    queryKey: marketingKeys.segments(),
    staleTime: 60_000,
    queryFn: async (): Promise<MarketingSegment[]> => {
      const { data, error } = await supabase
        .from("marketing_segment")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MarketingSegment[];
    },
  });
}

/**
 * Quantos contatos cada segmento tem, numa chamada só para a lista inteira.
 *
 * Serve para bater o olho no potencial sem abrir o segmento. Uma chamada por linha faria a tela
 * avaliar a base uma vez por segmento.
 */
export function useSegmentCounts(locationIds?: string[]) {
  return useQuery({
    queryKey: marketingKeys.segmentCounts(locationIds),
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, MarketingSegmentCount>> => {
      const { data, error } = await supabase.rpc("marketing_segment_counts", {
        ...locationArg(locationIds),
      });
      if (error) throw error;
      const linhas = (data ?? []) as unknown as MarketingSegmentCount[];
      return Object.fromEntries(linhas.map((l) => [l.segment_id, l]));
    },
  });
}

/**
 * Prévia do público. `enabled` fica a cargo de quem chama para não bater no banco a cada tecla
 * digitada dentro do construtor.
 */
export function useSegmentPreview(
  definition: SegmentGroup,
  locationIds?: string[],
  enabled = true,
) {
  return useQuery({
    queryKey: marketingKeys.segmentPreview(definition, locationIds),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<MarketingSegmentPreview> => {
      const { data, error } = await supabase.rpc("marketing_segment_preview", {
        p_definition: definition as unknown as Json,
        ...locationArg(locationIds),
      });
      if (error) throw error;
      return data as unknown as MarketingSegmentPreview;
    },
  });
}

export function useSegmentContacts(
  definition: SegmentGroup,
  locationIds?: string[],
  enabled = true,
) {
  return useQuery({
    queryKey: marketingKeys.segmentContacts(definition, locationIds),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<MarketingSegmentContact[]> => {
      const { data, error } = await supabase.rpc("marketing_segment_contacts", {
        p_definition: definition as unknown as Json,
        ...locationArg(locationIds),
      });
      if (error) throw error;
      return (data ?? []) as unknown as MarketingSegmentContact[];
    },
  });
}

/**
 * RPCs de gravação com auditoria (20261207120000_marketing_mcp_gravacao). Não estão no database.ts:
 * o `gen:types` sai incompleto e apaga funções que existem no banco (memória do projeto), então a
 * chamada passa por este cast localizado até a regeneração sair limpa. A tela e o MCP de marketing
 * gravam pelas mesmas RPCs (docs/specs/marketing-mcp.md § 3).
 */
async function rpcAuditada(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const cliente = supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await cliente.rpc(fn, args);
  if (error) throw error;
  return data;
}

export function useSaveSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      description?: string | null;
      definition: SegmentGroup;
      locationIds: string[];
    }) =>
      // O servidor valida a definição, gera o slug, recusa segmento do RFM e grava a auditoria.
      (await rpcAuditada("marketing_save_segment", {
        p_segment_id: input.id ?? null,
        p_name: input.name,
        p_definition: input.definition,
        p_description: input.description ?? null,
        p_location_ids: input.locationIds,
      })) as string,
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}

export function useDeleteSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft delete no servidor: campanha antiga aponta para o segmento, e apagar de verdade
      // deixaria o histórico sem explicação de para quem aquilo foi.
      await rpcAuditada("marketing_delete_segment", { p_segment_id: id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}

// ─── Campanhas ───────────────────────────────────────────────────────────────

export function useCampaigns() {
  return useQuery({
    queryKey: marketingKeys.campaigns(),
    staleTime: 30_000,
    queryFn: async (): Promise<MarketingCampaign[]> => {
      const { data, error } = await supabase
        .from("marketing_campaign")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MarketingCampaign[];
    },
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: marketingKeys.campaign(id),
    enabled: Boolean(id),
    queryFn: async (): Promise<MarketingCampaign | null> => {
      const { data, error } = await supabase
        .from("marketing_campaign")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as MarketingCampaign | null;
    },
  });
}

export function useSaveCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      segmentId?: string | null;
      locationIds?: string[];
      canvas?: CampaignCanvas;
      sendCap?: number;
      status?: MarketingCampaign["status"];
    }) => {
      const id = (await rpcAuditada("marketing_save_campaign", {
        p_campaign_id: input.id ?? null,
        p_name: input.name,
        p_segment_id: input.segmentId ?? null,
        p_location_ids: input.locationIds ?? null,
        // Nulo preserva o fluxo já salvo: um save que não mexe no fluxo não pode zerá-lo.
        p_canvas: input.canvas ?? null,
        p_send_cap: input.sendCap ?? null,
      })) as string;
      if (input.status) {
        await rpcAuditada("marketing_set_campaign_status", {
          p_campaign_id: id,
          p_status: input.status,
        });
      }
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}

export type CampaignRunResult = {
  enrolled: number;
  processed: number;
  sent: number;
  skipped: number;
  suppressed: number;
  failed: number;
  completed: number;
  dispatchEnabled: boolean;
  testRecipient: string | null;
  capRemaining: number;
};

/**
 * Dispara a campanha pela Edge `marketing-run`. O envio de verdade só acontece com
 * `marketing_dispatch_enabled` ligado; com ela desligada a Edge grava tudo como `skipped` e a
 * tela mostra o que sairia.
 */
export function useRunCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string): Promise<CampaignRunResult> => {
      const { data, error } = await supabase.functions.invoke("marketing-run", {
        body: { campaignId },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
      }
      return data as CampaignRunResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}

export function useCampaignMessages(campaignId: string) {
  return useQuery({
    queryKey: marketingKeys.messages(campaignId),
    enabled: Boolean(campaignId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_message")
        .select("id, channel, status, to_address, subject, error, sent_at, created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Configuração de disparo ─────────────────────────────────────────────────

export type DispatchConfig = {
  enabled: boolean;
  dailyCap: number;
  testRecipient: string;
  emailFrom: string;
};

export function useDispatchConfig() {
  return useQuery({
    queryKey: marketingKeys.dispatchConfig(),
    staleTime: 60_000,
    queryFn: async (): Promise<DispatchConfig> => {
      const { data, error } = await supabase
        .from("app_setting")
        .select("key, value")
        .in("key", [
          "marketing_dispatch_enabled",
          "marketing_daily_send_cap",
          "marketing_test_recipient",
          "marketing_email_from",
        ]);
      if (error) throw error;
      const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? ""]));
      return {
        enabled: String(map.marketing_dispatch_enabled).toLowerCase() === "true",
        dailyCap: Number(map.marketing_daily_send_cap ?? "200") || 200,
        testRecipient: map.marketing_test_recipient ?? "",
        emailFrom: map.marketing_email_from ?? "",
      };
    },
  });
}

export function useSaveDispatchConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<DispatchConfig>) => {
      if (patch.enabled !== undefined) {
        // Vai para a auditoria com o motivo fixo da tela; pelo MCP o motivo é obrigatório e livre.
        await rpcAuditada("marketing_set_dispatch_enabled", {
          p_enabled: patch.enabled,
          p_reason: "Alterado pela tela do Manager",
        });
      }
      if (
        patch.dailyCap !== undefined ||
        patch.testRecipient !== undefined ||
        patch.emailFrom !== undefined
      ) {
        await rpcAuditada("marketing_set_dispatch_config", {
          p_test_recipient: patch.testRecipient ?? null,
          p_daily_cap: patch.dailyCap ?? null,
          p_email_from: patch.emailFrom ?? null,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: marketingKeys.dispatchConfig() }),
  });
}

// ─── Tempo real ──────────────────────────────────────────────────────────────

/**
 * Mantém o kanban em dia com o checkout sem recarregar a página.
 *
 * O gatilho do banco move o cartão quando a reserva muda de status; aqui a gente só escuta a
 * tabela e invalida a query. Recalcular o board no cliente a partir do evento seria manter uma
 * segunda cópia da regra de ordenação e do recorte por unidade, que já vivem na RPC.
 *
 * A RLS vale no canal, então só hub_admin recebe evento. Sem sessão o Realtime nem conecta, o que
 * é o caso do SSG no build.
 */
export function useLeadsRealtime(enabled = true) {
  const qc = useQueryClient();

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const canal = supabase
      .channel("marketing-leads")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marketing_lead" },
        () => {
          // Invalida a raiz: um cartão novo mexe no kanban, na lista e na contagem da coluna.
          qc.invalidateQueries({ queryKey: marketingKeys.all });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [qc, enabled]);
}

// ─── RFM e descobertas (E3.2) ────────────────────────────────────────────────

/**
 * Painel RFM. `staleTime` alto de propósito: o score é recalculado a cada consulta e varre a base
 * inteira, então refazer a conta a cada troca de aba é caro sem mudar nada na tela.
 */
export function useRfmOverview(locationIds?: string[], windowDays?: number) {
  return useQuery({
    queryKey: marketingKeys.rfm(locationIds, windowDays),
    staleTime: 120_000,
    queryFn: async (): Promise<MarketingRfmOverview> => {
      const { data, error } = await supabase.rpc("marketing_rfm_overview", {
        ...locationArg(locationIds),
        ...(windowDays ? { p_window_days: windowDays } : {}),
      });
      if (error) throw error;
      return data as unknown as MarketingRfmOverview;
    },
  });
}

/** Quem está numa célula da matriz. Só busca quando uma célula foi realmente aberta. */
export function useRfmContacts(segment: string | null, locationIds?: string[]) {
  return useQuery({
    queryKey: marketingKeys.rfmContacts(segment ?? "", locationIds),
    enabled: Boolean(segment),
    staleTime: 120_000,
    queryFn: async (): Promise<MarketingRfmContact[]> => {
      const { data, error } = await supabase.rpc("marketing_rfm_contacts", {
        p_segment: segment as string,
        ...locationArg(locationIds),
      });
      if (error) throw error;
      return (data ?? []) as unknown as MarketingRfmContact[];
    },
  });
}

export function useDiscoveries(locationIds?: string[], windowDays?: number) {
  return useQuery({
    queryKey: marketingKeys.discoveries(locationIds, windowDays),
    staleTime: 120_000,
    queryFn: async (): Promise<MarketingDiscoveries> => {
      const { data, error } = await supabase.rpc("marketing_discoveries", {
        ...locationArg(locationIds),
        ...(windowDays ? { p_window_days: windowDays } : {}),
      });
      if (error) throw error;
      return data as unknown as MarketingDiscoveries;
    },
  });
}
