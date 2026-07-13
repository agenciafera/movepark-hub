import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { parseInstallmentPolicy, type InstallmentPolicy } from "@/lib/installments";
import { shouldPollCheckout } from "@/features/checkout/checkout.logic";

export type PriceBreakdown = {
  currency: string;
  days: number;
  strategy: string | null;
  base_price: number;
  old_price: number | null;
  subtotal: number;
  auto_discount: { amount: number; rule_id: string | null; label: string | null } | null;
  coupon: { code: string; discount: number } | null;
  fare?: { tier: string; label: string; amount: number } | null;
  total: number;
  line_items: unknown[];
};

export type BookingForCheckout = {
  id: string;
  code: string;
  status: "pending" | "confirmed" | "checked_in" | "completed" | "cancelled" | "no_show";
  total_amount: number;
  currency: string;
  price_breakdown: PriceBreakdown | null;
  check_in_at: string;
  check_out_at: string;
  expires_at: string | null;
  created_at: string;
  passenger_count: number | null;
  has_pcd: boolean;
  vehicle_id: string | null;
  profile_id: string;
  customer_name: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  location: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
    company: { slug: string; name: string };
  };
  items: {
    id: string;
    item_type: "parking" | "add_on";
    quantity: number;
    unit_price: number;
    subtotal: number;
    parking_type: { code: string; name: string } | null;
    add_on_service: { name: string } | null;
  }[];
  payment: {
    id: string;
    status: "pending" | "authorized" | "paid" | "refunded" | "failed" | "cancelled";
    provider: string;
    method?: string;
    paid_at: string | null;
  } | null;
  coupon: {
    code: string;
    discount_applied: number;
    discount_type: "percent" | "fixed";
    discount_value: number;
  } | null;
};

const checkoutKey = (code: string) => ["checkout-booking", code] as const;

/**
 * Carrega booking pelo code + items + location + último payment.
 * Faz polling rápido enquanto status='pending' pra detectar confirmação automática.
 */
export function useCheckoutBooking(code: string | undefined) {
  return useQuery({
    queryKey: code ? checkoutKey(code) : ["checkout-booking", "none"],
    queryFn: async (): Promise<BookingForCheckout | null> => {
      if (!code) return null;
      const { data, error } = await supabase
        .from("booking")
        .select(
          `id, code, status, total_amount, currency, price_breakdown, check_in_at, check_out_at,
           expires_at, created_at, passenger_count, has_pcd, vehicle_id, profile_id,
           customer_name, customer_first_name, customer_last_name, customer_phone, customer_email,
           location:location!inner(id, slug, name, address,
             company:company!inner(slug, name)),
           items:booking_item(id, item_type, quantity, unit_price, subtotal,
             parking_type:parking_type(code, name),
             add_on_service:add_on_service(name)
           ),
           coupons:booking_coupon(discount_applied,
             coupon:coupon(code, discount_type, discount_value)
           ),
           payments:payment(id, status, provider, paid_at, created_at)`,
        )
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // deno-lint-ignore no-explicit-any
      const row = data as any;
      const payments = (row.payments ?? [])
        .slice()
        // deno-lint-ignore no-explicit-any
        .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
      const lastPayment = payments[0] ?? null;
      const bc = (row.coupons ?? [])[0] ?? null;
      return {
        id: row.id,
        code: row.code,
        status: row.status,
        total_amount: Number(row.total_amount),
        currency: row.currency,
        price_breakdown: (row.price_breakdown as PriceBreakdown | null) ?? null,
        check_in_at: row.check_in_at,
        check_out_at: row.check_out_at,
        expires_at: row.expires_at,
        created_at: row.created_at,
        passenger_count: row.passenger_count,
        has_pcd: row.has_pcd,
        vehicle_id: row.vehicle_id,
        profile_id: row.profile_id,
        customer_name: row.customer_name,
        customer_first_name: row.customer_first_name,
        customer_last_name: row.customer_last_name,
        customer_phone: row.customer_phone,
        customer_email: row.customer_email,
        location: row.location,
        items: (row.items ?? []).map(
          // deno-lint-ignore no-explicit-any
          (it: any) => ({
            id: it.id,
            item_type: it.item_type,
            quantity: it.quantity,
            unit_price: Number(it.unit_price),
            subtotal: Number(it.subtotal),
            parking_type: it.parking_type,
            add_on_service: it.add_on_service,
          }),
        ),
        payment: lastPayment
          ? {
              id: lastPayment.id,
              status: lastPayment.status,
              provider: lastPayment.provider,
              paid_at: lastPayment.paid_at,
            }
          : null,
        coupon: bc?.coupon
          ? {
              code: bc.coupon.code,
              discount_applied: Number(bc.discount_applied),
              discount_type: bc.coupon.discount_type,
              discount_value: Number(bc.coupon.discount_value),
            }
          : null,
      };
    },
    enabled: !!code,
    // Polling: enquanto pending, recarrega a cada 2s (boost pra detectar confirmação)
    refetchInterval: (q) => {
      const d = q.state.data;
      return shouldPollCheckout(d?.status, d?.payment?.status) ? 2000 : false;
    },
  });
}

export function useUpdateBookingVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { bookingId: string; vehicleId: string }) => {
      const { error } = await supabase
        .from("booking")
        .update({ vehicle_id: args.vehicleId })
        .eq("id", args.bookingId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkout-booking"] }),
  });
}

export function useUpdateBookingTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      bookingId: string;
      passenger_count: number | null;
      has_pcd: boolean;
    }) => {
      const { bookingId, ...rest } = args;
      const { error } = await supabase
        .from("booking")
        .update(rest)
        .eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkout-booking"] }),
  });
}

export function useUpdateBookingCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      bookingId: string;
      customer_first_name: string | null;
      customer_last_name: string | null;
      customer_phone: string | null;
      customer_email?: string | null;
    }) => {
      const { bookingId, ...rest } = args;
      const { error } = await supabase
        .from("booking")
        .update(rest)
        .eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkout-booking"] }),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { bookingId: string }) => {
      // Libera capacidade
      await supabase.rpc("release_booking_capacity", { p_booking_id: args.bookingId });
      // Marca como cancelada
      const { error } = await supabase
        .from("booking")
        .update({ status: "cancelled", deleted_at: new Date().toISOString() })
        .eq("id", args.bookingId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkout-booking"] }),
  });
}

export type RenewHoldResult = {
  ok: boolean;
  reason?: "not_pending" | "cap_reached";
  expires_at: string | null;
  cap_at?: string | null;
  cap_reached?: boolean;
};

/**
 * Renova o hold da reserva pendente (modal keep-alive "Ainda está aí?"). Server-authoritative via
 * RPC `renew_booking_hold`: estende `expires_at` respeitando o teto (`booking_hold_max_minutes`).
 */
export function useRenewBookingHold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string): Promise<RenewHoldResult> => {
      const { data, error } = await supabase.rpc("renew_booking_hold", { p_booking_id: bookingId });
      if (error) throw error;
      return data as RenewHoldResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkout-booking"] }),
  });
}

/** Teto de renovação do hold (min), config em `booking_hold_max_minutes` — lido via RPC pública. */
export function useBookingHoldMax() {
  return useQuery({
    queryKey: ["booking-hold-max"],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("get_booking_hold_max_minutes");
      if (error) throw error;
      return Number(data) || 90;
    },
    staleTime: 5 * 60_000,
  });
}


type MockPaymentResponse = {
  payment_id: string;
  status: "pending";
  expected_confirmation_in_seconds: number;
  pix_payload: string | null;
};

export function useMockPayment() {
  return useMutation({
    mutationFn: async (args: {
      booking_code: string;
      method: "pix" | "card";
      card_number?: string;
    }): Promise<MockPaymentResponse> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Você precisa estar logado");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mock-payment`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Pagamento falhou (HTTP ${res.status})`);
      }
      return res.json();
    },
  });
}

export type PixChargeResponse = {
  payment_id: string;
  status: "pending" | "paid" | "failed" | "refunded" | "canceled";
  qr_code: string | null;
  qr_code_url: string | null;
  expires_at: string | null;
};

/** Cobrança PIX real com split (E0.1.2) — Edge create-pix-charge. */
export function useCreatePixCharge() {
  return useMutation({
    mutationFn: async (args: { booking_code: string }): Promise<PixChargeResponse> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Você precisa estar logado");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-pix-charge`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Falha ao gerar PIX (HTTP ${res.status})`);
      }
      return res.json();
    },
  });
}

export type PaymentConfig = {
  public_key: string;
  installment_policy: InstallmentPolicy;
};

/** Config pública de pagamento (public key + política de parcelamento) — Edge get-payment-config. */
export function usePaymentConfig() {
  return useQuery({
    queryKey: ["payment-config"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PaymentConfig> => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-payment-config`;
      const res = await fetch(url, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      });
      if (!res.ok) throw new Error(`Falha ao carregar config de pagamento (HTTP ${res.status})`);
      const body = await res.json();
      return {
        public_key: body.public_key ?? "",
        installment_policy: parseInstallmentPolicy(body.installment_policy),
      };
    },
  });
}

export type CardChargeArgs = {
  booking_code: string;
  installments: number;
  card_token?: string;
  payment_method_id?: string;
  save_card?: boolean;
  holder_name?: string;
  brand?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
};

export type CardChargeResponse = {
  payment_id: string;
  status: "pending" | "paid" | "failed" | "refunded" | "canceled";
  installments: number;
  charged_amount: number;
  interest_amount: number;
  saved_card: boolean;
};

/** Cobrança cartão real com split + parcelamento (E0.1.3) — Edge create-card-charge. */
export function useCreateCardCharge() {
  return useMutation({
    mutationFn: async (args: CardChargeArgs): Promise<CardChargeResponse> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Você precisa estar logado");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-card-charge`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Falha ao processar o cartão (HTTP ${res.status})`);
      }
      return res.json();
    },
  });
}
