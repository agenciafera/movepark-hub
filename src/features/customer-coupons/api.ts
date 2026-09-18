import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CouponWallet, WalletCoupon } from "./couponWallet.logic";
import type { PlatformCouponUpsertArgs } from "./platformCoupons.logic";

/**
 * Contexto do pedido. Sem ele a carteira lista condições; com ele o banco devolve veredito,
 * motivo e o desconto real de cada cupom.
 */
export type OrderContext =
  /** Checkout: avalia contra o subtotal congelado da reserva, igual ao que a aplicação vai gravar. */
  | { bookingId: string }
  /** Listagem/simulação: preço vem de simulate_price para aquela unidade e período. */
  | { locationParkingTypeId: string; checkInAt: string; checkOutAt: string }
  | null;

function ctxKey(ctx: OrderContext): string {
  if (!ctx) return "sem-pedido";
  if ("bookingId" in ctx) return `reserva:${ctx.bookingId}`;
  return `unidade:${ctx.locationParkingTypeId}:${ctx.checkInAt}:${ctx.checkOutAt}`;
}

export const couponWalletKeys = {
  all: ["customer-coupons"] as const,
  wallet: (ctx: OrderContext) => [...couponWalletKeys.all, "wallet", ctxKey(ctx)] as const,
};

async function fetchWallet(ctx: OrderContext): Promise<CouponWallet> {
  const porReserva = ctx && "bookingId" in ctx;
  const { data, error } = await supabase.rpc("customer_coupon_wallet", {
    p_booking_id: porReserva ? ctx.bookingId : undefined,
    p_location_parking_type_id: ctx && !porReserva ? ctx.locationParkingTypeId : undefined,
    p_check_in_at: ctx && !porReserva ? ctx.checkInAt : undefined,
    p_check_out_at: ctx && !porReserva ? ctx.checkOutAt : undefined,
  });
  if (error) throw error;
  const raw = (data ?? {}) as { items?: unknown[]; has_order_context?: boolean };
  return {
    items: (raw.items ?? []) as WalletCoupon[],
    has_order_context: Boolean(raw.has_order_context),
  };
}

/** Carteira do cliente. `enabled: false` enquanto não há sessão (a RPC devolveria lista vazia). */
export function useCouponWallet(ctx: OrderContext = null, enabled = true) {
  return useQuery({
    queryKey: couponWalletKeys.wallet(ctx),
    queryFn: () => fetchWallet(ctx),
    enabled,
  });
}

type RpcResult = { ok?: boolean; error_code?: string | null } & Record<string, unknown>;

/** Guarda um cupom na carteira a partir do código digitado. */
export function useRedeemCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc("coupon_redeem", { p_code: code });
      if (error) throw error;
      return (data ?? {}) as RpcResult;
    },
    onSuccess: (res) => {
      if (res.ok) qc.invalidateQueries({ queryKey: couponWalletKeys.all });
    },
  });
}

/**
 * Aplica o cupom na reserva pendente. Invalida a carteira e a reserva do checkout, porque as duas
 * mostram o total e ficariam discordando entre si.
 */
export function useApplyCouponToBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { bookingId: string; code: string }) => {
      const { data, error } = await supabase.rpc("apply_coupon_to_booking", {
        p_booking_id: vars.bookingId,
        p_code: vars.code,
      });
      if (error) throw error;
      return (data ?? {}) as RpcResult;
    },
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: couponWalletKeys.all });
        qc.invalidateQueries({ queryKey: ["checkout-booking"] });
      }
    },
  });
}

/** Remove o cupom da reserva pendente ("Não usar o cupom"). */
export function useRemoveCouponFromBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase.rpc("remove_coupon_from_booking", {
        p_booking_id: bookingId,
      });
      if (error) throw error;
      return (data ?? {}) as RpcResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: couponWalletKeys.all });
      qc.invalidateQueries({ queryKey: ["checkout-booking"] });
    },
  });
}

// --- Gestão das campanhas da Movepark (Manager) ------------------------------------------------

export const platformCouponKeys = {
  all: ["platform-coupons"] as const,
  list: () => [...platformCouponKeys.all, "list"] as const,
};

/**
 * Lista as campanhas da Movepark. A RPC é gateada por `is_hub_admin()` e filtra
 * `company_id is null`, então cupom de parceiro nunca aparece aqui por acidente.
 */
export function usePlatformCoupons() {
  return useQuery({
    queryKey: platformCouponKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("manager_list_platform_coupons");
      if (error) throw error;
      return (data ?? []) as PlatformCouponRow[];
    },
  });
}

export type PlatformCouponRow = {
  id: string;
  code: string;
  title: string | null;
  description: string | null;
  terms: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number | string;
  max_discount_amount: number | string | null;
  audience: string;
  audience_inactive_days: number | null;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  times_used: number;
  per_user_limit: number | null;
  min_amount: number | string | null;
  min_days: number | null;
  is_active: boolean;
  sort_order: number;
};

/** Cria ou edita uma campanha. O servidor recusa percentual sem teto. */
export function useUpsertPlatformCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: PlatformCouponUpsertArgs) => {
      const { data, error } = await supabase.rpc("manager_upsert_platform_coupon", args as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformCouponKeys.all });
      // A carteira do cliente muda junto: campanha nova aparece sem recarregar a página.
      qc.invalidateQueries({ queryKey: couponWalletKeys.all });
    },
  });
}

/** Pausa ou retoma a campanha sem abrir o formulário. */
export function useSetPlatformCouponActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; is_active: boolean }) => {
      const { error } = await supabase.rpc("manager_set_platform_coupon_active", {
        p_coupon_id: vars.id,
        p_is_active: vars.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformCouponKeys.all });
      qc.invalidateQueries({ queryKey: couponWalletKeys.all });
    },
  });
}

// --- Reserva em andamento ----------------------------------------------------------------------

export type ReservaEmAndamento = {
  id: string;
  code: string;
  expires_at: string | null;
  location_name: string | null;
};

/**
 * A reserva que o cliente deixou no meio do checkout, se houver.
 *
 * É o que transforma a tela de descontos em algo acionável: com uma reserva aberta, escolher o
 * cupom aplica nela e leva para o pagamento. Sem ela, o cupom só pode ser guardado para a próxima.
 *
 * `expires_at > now()` filtra no servidor: reserva vencida ainda fica `pending` na tabela (quem
 * muda o status é a rotina de expiração), e oferecer cupom para ela mandaria o cliente para um
 * checkout morto.
 */
export function useReservaEmAndamento(enabled = true) {
  return useQuery({
    queryKey: [...couponWalletKeys.all, "reserva-em-andamento"],
    enabled,
    queryFn: async (): Promise<ReservaEmAndamento | null> => {
      const { data, error } = await supabase
        .from("booking")
        .select("id, code, expires_at, location:location(name)")
        .eq("status", "pending")
        .is("deleted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as {
        id: string;
        code: string;
        expires_at: string | null;
        location: { name: string } | null;
      };
      return {
        id: row.id,
        code: row.code,
        expires_at: row.expires_at,
        location_name: row.location?.name ?? null,
      };
    },
  });
}
