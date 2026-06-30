import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { bucketBooking, type MyBookingStatus } from "./bookings.logic";

export type { MyBookingStatus };

export type MyBookingListItem = {
  id: string;
  code: string;
  status: "pending" | "confirmed" | "checked_in" | "completed" | "cancelled" | "no_show";
  check_in_at: string;
  check_out_at: string;
  expires_at: string | null;
  total_amount: number;
  created_at: string;
  location: {
    name: string;
    slug: string;
    address: string | null;
    company: { name: string; slug: string };
  };
  parking_type: { name: string; code: string } | null;
};

const baseSelect = `
  id, code, status, check_in_at, check_out_at, expires_at, total_amount, created_at,
  location:location!inner(
    name, slug, address,
    company:company!inner(name, slug)
  ),
  booking_item:booking_item!inner(
    item_type, parking_type:parking_type(name, code)
  )
`;

export function useMyBookings(
  profileId: string | undefined,
  bucket: MyBookingStatus,
) {
  return useQuery({
    queryKey: ["my-bookings", profileId ?? "anon", bucket] as const,
    queryFn: async (): Promise<MyBookingListItem[]> => {
      if (!profileId) return [];
      const { data, error } = await supabase
        .from("booking")
        .select(baseSelect)
        .eq("profile_id", profileId)
        .order("check_in_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const items = (data ?? []).map((row) => {
        // deno-lint-ignore no-explicit-any
        const r = row as any;
        const parkingItem = (r.booking_item ?? []).find(
          // deno-lint-ignore no-explicit-any
          (b: any) => b.item_type === "parking",
        );
        return {
          id: r.id,
          code: r.code,
          status: r.status,
          check_in_at: r.check_in_at,
          check_out_at: r.check_out_at,
          expires_at: r.expires_at,
          total_amount: Number(r.total_amount),
          created_at: r.created_at,
          location: r.location,
          parking_type: parkingItem?.parking_type ?? null,
        } as MyBookingListItem;
      });
      return items.filter((b) => bucketBooking(b) === bucket);
    },
    enabled: !!profileId,
    staleTime: 30_000,
  });
}

export type MyBookingDetail = MyBookingListItem & {
  passenger_count: number | null;
  has_pcd: boolean;
  checked_in_at: string | null;
  fare_tier: import("@/lib/fares").FareTier;
  fare_price_cents: number;
  fare_cancel_until: string | null;
  fare_benefits: import("@/lib/fares").FareBenefits | null;
  vehicle: { id: string; license_plate: string; model: string | null; color: string | null } | null;
  items: {
    id: string;
    item_type: "parking" | "add_on";
    unit_price: number;
    subtotal: number;
    parking_type: { name: string } | null;
    add_on_service: { name: string } | null;
  }[];
  payment: { status: string; provider: string; paid_at: string | null } | null;
  location_detail: {
    phone: string | null;
    email: string | null;
    notice: string | null;
    reservation_policy: string | null;
    latitude: number | null;
    longitude: number | null;
  };
};

export function useBookingDetail(code: string | undefined) {
  return useQuery({
    queryKey: ["booking-detail", code] as const,
    queryFn: async (): Promise<MyBookingDetail | null> => {
      if (!code) return null;
      const { data, error } = await supabase
        .from("booking")
        .select(
          `id, code, status, check_in_at, check_out_at, expires_at, total_amount, created_at,
           passenger_count, has_pcd, checked_in_at,
           fare_tier, fare_price_cents, fare_cancel_until, fare_benefits,
           location:location!inner(
             name, slug, address, phone, email, notice, reservation_policy,
             latitude, longitude,
             company:company!inner(name, slug)
           ),
           vehicle:vehicle(id, license_plate, model, color),
           items:booking_item(
             id, item_type, unit_price, subtotal,
             parking_type:parking_type(name, code),
             add_on_service:add_on_service(name)
           ),
           payments:payment(status, provider, paid_at, created_at)`,
        )
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // deno-lint-ignore no-explicit-any
      const r = data as any;
      const parkingItem = (r.items ?? []).find(
        // deno-lint-ignore no-explicit-any
        (b: any) => b.item_type === "parking",
      );
      const payments = (r.payments ?? [])
        .slice()
        // deno-lint-ignore no-explicit-any
        .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
      const lastPayment = payments[0] ?? null;

      return {
        id: r.id,
        code: r.code,
        status: r.status,
        check_in_at: r.check_in_at,
        check_out_at: r.check_out_at,
        expires_at: r.expires_at,
        total_amount: Number(r.total_amount),
        created_at: r.created_at,
        passenger_count: r.passenger_count,
        has_pcd: r.has_pcd,
        checked_in_at: r.checked_in_at ?? null,
        fare_tier: (r.fare_tier ?? "basica") as import("@/lib/fares").FareTier,
        fare_price_cents: Number(r.fare_price_cents ?? 0),
        fare_cancel_until: r.fare_cancel_until ?? null,
        fare_benefits: (r.fare_benefits ?? null) as import("@/lib/fares").FareBenefits | null,
        location: {
          name: r.location.name,
          slug: r.location.slug,
          address: r.location.address,
          company: r.location.company,
        },
        parking_type: parkingItem?.parking_type ?? null,
        vehicle: r.vehicle ?? null,
        items: (r.items ?? []).map(
          // deno-lint-ignore no-explicit-any
          (it: any) => ({
            id: it.id,
            item_type: it.item_type,
            unit_price: Number(it.unit_price),
            subtotal: Number(it.subtotal),
            parking_type: it.parking_type,
            add_on_service: it.add_on_service,
          }),
        ),
        payment: lastPayment
          ? {
              status: lastPayment.status,
              provider: lastPayment.provider,
              paid_at: lastPayment.paid_at,
            }
          : null,
        location_detail: {
          phone: r.location.phone,
          email: r.location.email,
          notice: r.location.notice,
          reservation_policy: r.location.reservation_policy,
          latitude: r.location.latitude != null ? Number(r.location.latitude) : null,
          longitude: r.location.longitude != null ? Number(r.location.longitude) : null,
        },
      };
    },
    enabled: !!code,
    staleTime: 30_000,
  });
}

/**
 * Gera/recupera o PDF do voucher via Edge Function `voucher-pdf` (JWT do usuário)
 * e devolve a signed URL para download. Ver supabase/functions/voucher-pdf.
 */
export function useVoucherPdf() {
  return useMutation({
    mutationFn: async (code: string): Promise<{ url: string; code: string }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Você precisa entrar pra baixar o voucher.");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voucher-pdf`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Falha ao gerar voucher (HTTP ${res.status})`);
      }
      return res.json();
    },
  });
}

export type CancelBookingResult = {
  status: string;
  refunded: boolean;
  refund_pending: boolean;
};

/**
 * Cancela a reserva pela Edge `cancel-booking` (que orquestra o estorno via gateway, E0.3.2).
 * Recebe o `code` da reserva — a Edge resolve dono/staff, política de 24h e split.
 */
/** Troca o veículo da reserva (E2.8-c/f) via Edge change-booking-vehicle. */
export function useChangeBookingVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { bookingCode: string; vehicleId: string }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Você precisa entrar.");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/change-booking-vehicle`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ booking_code: args.bookingCode, vehicle_id: args.vehicleId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Falha ao trocar veículo (HTTP ${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["booking-detail"] });
    },
  });
}

/** Altera as datas de uma reserva pendente (E2.8-f) via Edge change-booking-dates. */
export function useChangeBookingDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { bookingCode: string; checkInAt: string; checkOutAt: string }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Você precisa entrar.");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/change-booking-dates`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          booking_code: args.bookingCode,
          check_in_at: args.checkInAt,
          check_out_at: args.checkOutAt,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Falha ao alterar datas (HTTP ${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["booking-detail"] });
    },
  });
}

export function useCancelMyBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingCode: string): Promise<CancelBookingResult> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Você precisa entrar pra cancelar a reserva.");

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
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["booking-detail"] });
    },
  });
}
