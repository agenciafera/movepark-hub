import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { prospectLocationsKeys } from "@/features/prospect-locations/api";
import type { PriceResearchRow } from "@/types/domain";

/**
 * Fila de decisão do robô de pesquisa de preço (E0.17 · ADR-009 / ADR-010).
 *
 * O robô semanal propõe; aqui um hub_admin aplica ou recusa. Nada nesta tela escreve direto
 * em `prospect_location`: a RPC de decisão é quem substitui os quatro preços, a data e a
 * fonte de uma vez, porque a linha publicada tem que descrever uma leitura só.
 *
 * Spec: docs/specs/pesquisa-de-preco-concorrente.md
 */

export const priceResearchKeys = {
  all: ["price-research"] as const,
  pending: () => [...priceResearchKeys.all, "pending"] as const,
};

/** `numeric` do Postgres chega como string no PostgREST; a tela precisa de número. */
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchPending(): Promise<PriceResearchRow[]> {
  const { data, error } = await supabase.rpc("manager_price_research_pending");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    daily_brl: toNumber(row.daily_brl),
    weekly_brl: toNumber(row.weekly_brl),
    biweekly_brl: toNumber(row.biweekly_brl),
    monthly_brl: toNumber(row.monthly_brl),
    atual_daily_brl: toNumber(row.atual_daily_brl),
    atual_weekly_brl: toNumber(row.atual_weekly_brl),
    atual_biweekly_brl: toNumber(row.atual_biweekly_brl),
    atual_monthly_brl: toNumber(row.atual_monthly_brl),
  })) as unknown as PriceResearchRow[];
}

/** Admin (hub_admin): o que o robô achou e ainda espera decisão. */
export function usePriceResearchPending() {
  return useQuery({ queryKey: priceResearchKeys.pending(), queryFn: fetchPending });
}

export type PriceResearchDecision = {
  id: string;
  action: "apply" | "reject";
  note?: string | null;
};

/**
 * Aplica ou recusa uma proposta.
 *
 * Invalida também a lista de lotes mapeados: aplicar muda o preço da ficha, e as duas telas
 * mostram o mesmo dado.
 */
export function useDecidePriceResearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, note }: PriceResearchDecision) => {
      const { error } = await supabase.rpc("manager_price_research_decide", {
        p_id: id,
        p_action: action,
        ...(note ? { p_note: note } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: priceResearchKeys.all });
      qc.invalidateQueries({ queryKey: prospectLocationsKeys.all });
    },
  });
}
