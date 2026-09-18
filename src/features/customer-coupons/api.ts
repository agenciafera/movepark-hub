import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CouponWallet, WalletCoupon } from "./couponWallet.logic";

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
