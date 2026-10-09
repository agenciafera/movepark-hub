import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type {
  BookingStatus,
  BookingWithRelations,
  BookingsPageSummary,
  UnifiedBookingRow,
  WlListRow,
} from "@/types/domain";
import { CHANNEL_ORIGINS, type ChannelFilter, type PaymentMethodFilter } from "./bookingList.logic";

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
   * amanhã). A ordenação NÃO acompanha o campo: a lista sai sempre da compra mais recente para a
   * mais antiga (`created_at desc`), nas duas telas (decidido em 05/10/2026, porque ordenar por
   * check-in jogava a reserva recém-feita para o meio da lista do Operator).
   */
  dateField?: "check_in_at" | "created_at";
  /** Código da reserva, nome, e-mail ou telefone do cliente (snapshot da reserva). */
  search?: string;
  /** Forma do pagamento; `none` = reserva que nunca teve pagamento. */
  paymentMethod?: PaymentMethodFilter;
  /** Canal de venda (agrupa `booking.origin`). */
  channel?: ChannelFilter;
};

export const bookingsKeys = {
  all: ["bookings"] as const,
  detail: (id: string) => [...bookingsKeys.all, "detail", id] as const,
  recent: (locationIds?: string[]) => [...bookingsKeys.all, "recent", locationIds] as const,
};

const baseSelect =
  "*, profile:profiles(id, full_name, tax_id), location:location(id, name, slug, timezone, company:company(id, name, slug)), vehicle:vehicle(id, license_plate, model, color), payments:payment(id, status, refunded_at, created_at, paid_at, method, installments), fare_extensions:booking_fare_extension(id, kind, flight_number, new_check_out_at, requested_check_out_at, overage_daily_cents, overage_cents, actual_check_out_at, overage_charged_cents, overage_note, partner_credit_cents)";

/**
 * Lista única, Hub + white-label (reservas-unificadas-hub-wl.md § 3).
 *
 * O servidor (`bookings_list_page`, com a permissão de quem chama) junta as duas origens, aplica
 * os filtros, ordena pela compra e pagina. A reserva do Hub volta só com o id e é montada aqui com
 * a mesma consulta de sempre (`baseSelect`: pagamento, dinheiro, proteção de voo), então a linha
 * do Hub é idêntica à de antes. A do site já vem pronta.
 */
export type BookingPageFilters = BookingFilters & {
  /** Origem: todas, só Hub ou só site. Para quem não tem white-label o servidor nem lê o site. */
  source?: "all" | "hub" | "wl";
  /** Visão do estacionamento: só reserva que virou venda (mesma regra de `partnerSeesBooking`). */
  partnerView?: boolean;
  page: number;
  pageSize: number;
};

export type BookingsPage = {
  total: number;
  rows: UnifiedBookingRow[];
  summary: BookingsPageSummary;
};

const EMPTY_SUMMARY: BookingsPageSummary = {
  hub: { total: 0, paid: 0, pix: 0, card: 0, paid_amount: 0, awaiting: 0, lost: 0 },
  wl: { total: 0, paid: 0, paid_amount: 0 },
};

// A RPC não está em `database.ts` (o gen types vem apagando tipos que existem; ver
// src/features/wl-health/api.ts). O cast fica aqui só.
function rpc(fn: string, args: Record<string, unknown>) {
  const call = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  return call(fn, args);
}

async function fetchBookingsPage(f: BookingPageFilters): Promise<BookingsPage> {
  const { data, error } = await rpc("bookings_list_page", {
    p_source: f.source ?? "all",
    p_statuses: f.status?.length ? f.status : null,
    p_location_ids: f.locationIds?.length ? f.locationIds : null,
    p_company_ids: f.companyIds?.length ? f.companyIds : null,
    p_date_field: f.dateField ?? "check_in_at",
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_search: f.search?.trim() || null,
    p_payment: f.paymentMethod ?? null,
    p_channel_origins: f.channel ? CHANNEL_ORIGINS[f.channel] : null,
    p_partner_view: f.partnerView ?? false,
    p_limit: f.pageSize,
    p_offset: f.page * f.pageSize,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as {
    total?: number;
    items?: { source: "hub" | "wl"; id: string; wl?: WlListRow }[];
    summary?: BookingsPageSummary;
  };
  const items = r.items ?? [];

  const hubIds = items.filter((i) => i.source === "hub").map((i) => i.id);
  const hubById = new Map<string, BookingWithRelations>();
  if (hubIds.length) {
    const { data: hub, error: hubErr } = await supabase.from("booking").select(baseSelect).in("id", hubIds);
    if (hubErr) throw hubErr;
    for (const b of (hub ?? []) as unknown as BookingWithRelations[]) hubById.set(b.id, b);
  }

  const rows: UnifiedBookingRow[] = [];
  for (const i of items) {
    if (i.source === "wl" && i.wl) rows.push({ source: "wl", id: i.id, wl: i.wl });
    else if (i.source === "hub" && hubById.has(i.id)) rows.push({ source: "hub", id: i.id, booking: hubById.get(i.id)! });
  }
  return { total: Number(r.total ?? 0), rows, summary: r.summary ?? EMPTY_SUMMARY };
}

export function useBookingsPage(filters: BookingPageFilters) {
  return useQuery({
    queryKey: [...bookingsKeys.all, "page", filters] as const,
    queryFn: () => fetchBookingsPage(filters),
    placeholderData: (prev) => prev,
  });
}

/**
 * Select da tela da reserva: as relações da lista, com o pagamento completo (split, taxa,
 * abatimento, estorno), que é de onde saem os valores destrinchados. A RLS de `payment` já deixa
 * a empresa ler os pagamentos das próprias reservas, então vale para Manager e Operator.
 */
const detailSelect = baseSelect.replace(
  "payments:payment(id, status, refunded_at, created_at, paid_at, method, installments)",
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

/**
 * Check-out de reserva com proteção de voo acionada (25/09/2026): registra a saída real e o que o
 * balcão cobrou pelo excedente. A RPC confere o escopo, calcula o excedente e conclui a reserva.
 */
export function useRecordFlightCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { bookingId: string; actualCheckOutAt: string; chargedCents: number; note: string | null }) => {
      const { data, error } = await supabase.rpc("operator_record_flight_checkout", {
        p_booking_id: args.bookingId,
        p_actual_check_out_at: args.actualCheckOutAt,
        p_overage_charged_cents: args.chargedCents,
        p_note: args.note ?? undefined,
      });
      if (error) throw error;
      return data as { overage_cents: number; overage_charged_cents: number; actual_check_out_at: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingsKeys.all }),
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

const RECONCILE_FEES_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reconcile-gateway-fees`;

/**
 * Apura no gateway a taxa e a data de liberação das cobranças de UMA reserva (hub_admin). A tela
 * da reserva chama ao abrir quando a taxa ainda não foi apurada: o cron demora até 30 min e o
 * recebível já existe segundos depois do pagamento.
 */
export function useReconcileBookingFees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string): Promise<{ ok: boolean; checked: number; updated: number }> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Entre novamente.");
      const res = await fetch(RECONCILE_FEES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ booking_id: bookingId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha (HTTP ${res.status})`);
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingsKeys.all }),
  });
}
