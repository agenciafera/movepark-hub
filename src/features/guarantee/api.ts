// Acionamentos da garantia de vaga (23/09/2026). Spec: docs/specs/spot-guarantee.md
// O cliente abre pela reserva (`claim_spot_guarantee`, em bookings/customerApi); aqui é o lado da
// Movepark: a fila de acionamentos abertos e o fechamento com desfecho e valor coberto.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const guaranteeKeys = {
  all: ["guarantee-claims"] as const,
  list: (status: string) => [...guaranteeKeys.all, "list", status] as const,
};

export type GuaranteeClaimRow = {
  id: string;
  booking_id: string;
  opened_at: string;
  channel: string;
  status: "open" | "relocated" | "refunded" | "dismissed";
  covered_cents: number;
  note: string | null;
  resolved_at: string | null;
  booking: {
    code: string;
    customer_name: string | null;
    customer_phone: string | null;
    check_in_at: string;
    location: { name: string; company: { name: string } } | null;
  } | null;
};

export type GuaranteeOutcome = "relocated" | "refunded" | "dismissed";

export const GUARANTEE_STATUS_LABEL: Record<GuaranteeClaimRow["status"], string> = {
  open: "Aberto",
  relocated: "Realocado",
  refunded: "Devolvido",
  dismissed: "Sem procedência",
};

async function fetchClaims(status: "open" | "all"): Promise<GuaranteeClaimRow[]> {
  let q = supabase
    .from("guarantee_claim")
    .select(
      "id, booking_id, opened_at, channel, status, covered_cents, note, resolved_at, booking:booking(code, customer_name, customer_phone, check_in_at, location:location(name, company:company(name)))",
    )
    .order("opened_at", { ascending: false })
    .limit(100);
  if (status === "open") q = q.eq("status", "open");
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as GuaranteeClaimRow[];
}

/** Acionamentos da garantia (hub_admin pela RLS). `open` é a fila de trabalho. */
export function useGuaranteeClaims(status: "open" | "all" = "open") {
  return useQuery({ queryKey: guaranteeKeys.list(status), queryFn: () => fetchClaims(status) });
}

/** Fecha um acionamento com o desfecho, o valor coberto pela Movepark e a nota. */
export function useResolveGuaranteeClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: GuaranteeOutcome; coveredCents: number; note: string | null }) => {
      const { data, error } = await supabase.rpc("admin_resolve_guarantee_claim", {
        p_id: input.id,
        p_status: input.status,
        p_covered_cents: input.coveredCents,
        p_note: input.note ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: guaranteeKeys.all }),
  });
}
