import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { WlHealthReport } from "@/types/domain";

/**
 * Saúde da integração com o white-label (Manager, hub_admin).
 *
 * Tudo passa por RPC SECURITY DEFINER com gate `is_hub_admin()` no servidor (ADR-005); a rota
 * só espelha. `manager_wl_health` junta numa chamada a saúde resumida, as entregas que pedem
 * atenção e o estado de cada vaga mapeada.
 *
 * Spec: docs/specs/shared-availability.md (§ Saúde da integração).
 */

export const wlHealthKeys = {
  all: ["wl-health"] as const,
  report: () => [...wlHealthKeys.all, "report"] as const,
};

// As RPCs desta tela não estão em `database.ts` porque o `supabase gen types` vem derrubando
// tabelas e funções que existem no banco (em 08/10/2026 apagou `payout_debt_reservation` e
// colunas de `booking`), e regenerar apagaria os tipos delas. O cast fica aqui só, e some
// quando a geração voltar a sair inteira. `.bind`: sem ele o método perde o `this`.
function rpc(fn: string, args?: Record<string, unknown>) {
  const call = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  return call(fn, args);
}

async function fetchReport(): Promise<WlHealthReport> {
  const { data, error } = await rpc("manager_wl_health");
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Partial<WlHealthReport>;
  // Sem o resumo, a tela não pode dizer nem "tudo em dia" nem "tem problema": as duas leituras
  // seriam inventadas. Melhor mostrar o erro.
  if (!r.health || typeof r.health !== "object") {
    throw new Error("A resposta veio sem o resumo da saúde do white-label.");
  }
  return {
    health: r.health as WlHealthReport["health"],
    deliveries: r.deliveries ?? [],
    recent: r.recent ?? { delivered_24h: 0, pending: 0, last_delivered_at: null },
    units: r.units ?? [],
  };
}

export function useWlHealth() {
  return useQuery({ queryKey: wlHealthKeys.report(), queryFn: fetchReport });
}

/** Devolve uma entrega `failed` para a fila. A próxima volta do cron (1 min) reenvia. */
export function useRetryWlDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deliveryId: string): Promise<boolean> => {
      const { data, error } = await rpc("wl_delivery_retry", { p_id: deliveryId });
      if (error) throw new Error(error.message);
      return data === true;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: wlHealthKeys.all }),
  });
}
