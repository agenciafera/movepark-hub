import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type BookingForCheckout = {
  id: string;
  code: string;
  status: "pending" | "confirmed" | "checked_in" | "completed" | "cancelled" | "no_show";
  total_amount: number;
  currency: string;
  check_in_at: string;
  check_out_at: string;
  expires_at: string | null;
  passenger_count: number | null;
  has_pcd: boolean;
  vehicle_id: string | null;
  profile_id: string;
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
          `id, code, status, total_amount, currency, check_in_at, check_out_at,
           expires_at, passenger_count, has_pcd, vehicle_id, profile_id,
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
        check_in_at: row.check_in_at,
        check_out_at: row.check_out_at,
        expires_at: row.expires_at,
        passenger_count: row.passenger_count,
        has_pcd: row.has_pcd,
        vehicle_id: row.vehicle_id,
        profile_id: row.profile_id,
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
      // deno-lint-ignore no-explicit-any
      const d = q.state.data as any;
      if (d?.status === "pending" || d?.payment?.status === "pending") {
        return 2000;
      }
      return false;
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
