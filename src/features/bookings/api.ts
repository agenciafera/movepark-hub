import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { BookingStatus, BookingWithRelations } from "@/types/domain";

type BookingUpdate = Database["public"]["Tables"]["booking"]["Update"];

export type BookingFilters = {
  status?: BookingStatus[];
  companyIds?: string[];
  locationIds?: string[];
  from?: string;
  to?: string;
  /**
   * Qual data o `from`/`to` recorta. Padrão `check_in_at` (o pátio olha quem chega). O Manager
   * usa `created_at`, a data da compra: reserva feita hoje para a semana que vem aparece hoje
   * (decidido em 16/09/2026, quando a primeira reserva de teste sumiu da lista por ter check-in
   * amanhã). A ordenação acompanha o campo.
   */
  dateField?: "check_in_at" | "created_at";
  search?: string;
};

export const bookingsKeys = {
  all: ["bookings"] as const,
  list: (filters: BookingFilters) => [...bookingsKeys.all, "list", filters] as const,
  detail: (id: string) => [...bookingsKeys.all, "detail", id] as const,
  recent: (locationIds?: string[]) => [...bookingsKeys.all, "recent", locationIds] as const,
};

const baseSelect =
  "*, profile:profiles(id, full_name, tax_id), location:location(id, name, slug, timezone, company:company(id, name, slug)), vehicle:vehicle(id, license_plate, model, color), payments:payment(id, status, refunded_at, created_at, paid_at, method)";

async function fetchBookings(filters: BookingFilters): Promise<BookingWithRelations[]> {
  // Reserva cancelada carrega `deleted_at` (que também é o "cancelada em" na UI). A lista
  // do painel (operador e manager) PRECISA mostrar as canceladas, então NÃO filtramos
  // `deleted_at` aqui: a RLS de `booking` já restringe às reservas da empresa e o filtro de
  // status resolve o resto. Filtrar deleted_at deixava o filtro "Cancelada" natimorto.
  // Ver docs/testes/furos-visao-dono.md (F1).
  const dateField = filters.dateField ?? "check_in_at";
  let query = supabase
    .from("booking")
    .select(baseSelect)
    .order(dateField, { ascending: false })
    .limit(100);

  if (filters.status?.length) query = query.in("status", filters.status);
  if (filters.locationIds?.length) query = query.in("location_id", filters.locationIds);
  if (filters.from) query = query.gte(dateField, filters.from);
  if (filters.to) query = query.lte(dateField, filters.to);
  if (filters.search) {
    query = query.or(`code.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  let rows = (data ?? []) as unknown as BookingWithRelations[];

  if (filters.companyIds?.length) {
    rows = rows.filter((r) => filters.companyIds!.includes(r.location?.company?.id ?? ""));
  }
  return rows;
}

export function useBookings(filters: BookingFilters) {
  return useQuery({
    queryKey: bookingsKeys.list(filters),
    queryFn: () => fetchBookings(filters),
  });
}

/**
 * Select da tela da reserva: as relações da lista, com o pagamento completo (split, taxa,
 * abatimento, estorno), que é de onde saem os valores destrinchados. A RLS de `payment` já deixa
 * a empresa ler os pagamentos das próprias reservas, então vale para Manager e Operator.
 */
const detailSelect = baseSelect.replace(
  "payments:payment(id, status, refunded_at, created_at, paid_at, method)",
  "payments:payment(id, status, refunded_at, created_at, paid_at, method, amount, installments, split, split_sent_to_gateway, debt_recovered_cents, gateway_fee_cents, partner_release_at, refunded_amount, refund_absorbed_by_master, refund_partner_cents)",
);

/** Uma reserva pelo código, com as relações da lista e o pagamento completo (tela de detalhe). */
export function useBookingByCode(code: string | undefined) {
  return useQuery({
    queryKey: [...bookingsKeys.all, "by-code", code ?? ""] as const,
    enabled: !!code,
    queryFn: async (): Promise<BookingWithRelations | null> => {
      const { data, error } = await supabase.from("booking").select(detailSelect).eq("code", code!).limit(1);
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as unknown as BookingWithRelations | null;
    },
  });
}

export function useRecentBookings(limit = 20, locationIds?: string[]) {
  return useQuery({
    queryKey: bookingsKeys.recent(locationIds),
    queryFn: async () => {
      let q = supabase
        .from("booking")
        .select(baseSelect)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (locationIds?.length) q = q.in("location_id", locationIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BookingWithRelations[];
    },
  });
}

type UpdateStatusInput = {
  bookingId: string;
  status: BookingStatus;
  timestamp?: { field: "checked_in_at" | "checked_out_at"; value: string };
  notes?: string;
};

// Escrita direta na reserva: o trigger `booking_guard_write_allowlist` só aceita do staff `status`,
// `checked_in_at`, `checked_out_at` e `notes`. Campo novo neste patch exige migration na allowlist
// (docs/specs/booking-flow.md), senão o PATCH volta 403.
export function useUpdateBookingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, status, timestamp, notes }: UpdateStatusInput) => {
      const patch: BookingUpdate = { status };
      if (timestamp) patch[timestamp.field] = timestamp.value;
      if (notes !== undefined) patch.notes = notes;
      const { error } = await supabase.from("booking").update(patch).eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bookingsKeys.all });
    },
  });
}

export type CancelBookingResult = {
  status: string;
  refunded: boolean;
  refund_pending: boolean;
  /** O gateway recusou o estorno de forma definitiva: a devolução foi para a fila manual. */
  refund_manual?: boolean;
};

/**
 * Cancela uma reserva como staff (operador/hub_admin) via Edge `cancel-booking`, que estorna o
 * pagamento quando aplicável (E0.3.2). Staff pode estornar como override (fora da janela de 24h).
 */
export function useCancelBookingStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingCode: string): Promise<CancelBookingResult> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-booking`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ booking_code: bookingCode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Falha ao cancelar (HTTP ${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bookingsKeys.all });
    },
  });
}

// ── Rastro do gateway (E0.3.9) ───────────────────────────────────────────────

export type GatewayTrailPayment = {
  id: string;
  kind: string;
  method: string | null;
  status: string;
  amount: number;
  installments: number | null;
  provider_payment_id: string | null;
  provider_charge_id: string | null;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
  refunded_at: string | null;
  refunded_amount: number | null;
  refund_reason: string | null;
  refund_absorbed_by_master: boolean;
  refund_partner_cents: number;
  refund_partner_balance_cents: number | null;
  refund_split: unknown;
  split: { role?: string; recipientId?: string | null; amount: number; liable?: boolean; chargeProcessingFee?: boolean }[] | null;
  split_sent_to_gateway: boolean | null;
  debt_recovered_cents: number;
  gateway_fee_cents: number | null;
  gateway_fee_synced_at: string | null;
  partner_release_at: string | null;
  pix_qr_code_url: string | null;
};

export type GatewayTrailEvent = {
  id: string;
  payment_id: string | null;
  kind: string;
  http_status: number | null;
  request: unknown;
  response: unknown;
  note: string | null;
  created_at: string;
};

export type GatewayTrail = { payments: GatewayTrailPayment[]; events: GatewayTrailEvent[] };

/**
 * O que a Pagar.me devolveu para esta reserva (RPC `booking_gateway_trail`): os pagamentos com
 * order e charge, split, estorno, taxa e liberação, e o rastro de cada chamada (cobrança,
 * estorno, webhooks) com a resposta crua. Só hub_admin; para os outros a RPC devolve nulo.
 */
export function useBookingGatewayTrail(bookingId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...bookingsKeys.all, "gateway-trail", bookingId ?? "none"] as const,
    enabled: enabled && !!bookingId,
    queryFn: async (): Promise<GatewayTrail | null> => {
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: "booking_gateway_trail",
        a: { p_booking_id: string },
      ) => PromiseLike<{ data: GatewayTrail | null; error: { message: string } | null }>;
      const { data, error } = await rpc("booking_gateway_trail", { p_booking_id: bookingId! });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}
