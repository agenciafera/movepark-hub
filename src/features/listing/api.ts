import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CouponPreview } from "./coupon.logic";
import type { AddOnOption } from "./reservation.logic";

export type ListingDetail = {
  id: string; // location_parking_type_id
  capacity: number;
  is_active: boolean;
  company: {
    id: string;
    slug: string;
    name: string;
    legal_name: string | null;
    created_at: string;
  };
  location: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    notice: string | null;
    has_notice: boolean;
    reservation_policy: string | null;
    timezone: string;
    latitude: number | null;
    longitude: number | null;
    has_pcd_config: boolean;
    has_passenger_quantity: boolean;
  };
  parking_type: {
    code: string;
    name: string;
    description: string | null;
  };
  company_parking_type: {
    base_price: number;
  };
  amenities: { code: string; name: string; icon: string | null; category: string }[];
  other_locations: { id: string; name: string; slug: string }[];
};

const baseSelect = `
  id, capacity, is_active,
  location:location!inner(
    id, slug, name, address, phone, email, notice, has_notice,
    reservation_policy, timezone, latitude, longitude,
    has_pcd_config, has_passenger_quantity,
    company:company!inner(id, slug, name, legal_name, created_at),
    amenities:location_amenity(
      amenity:amenity(code, name, icon, category, sort_order)
    )
  ),
  company_parking_type:company_parking_type!inner(
    base_price,
    parking_type:parking_type!inner(code, name, description)
  )
`;

export async function fetchListing(
  operatorSlug: string,
  locationSlug: string,
  parkingTypeCode: string,
): Promise<ListingDetail | null> {
  const { data, error } = await supabase
    .from("location_parking_type")
    .select(baseSelect)
    .eq("is_active", true)
    .limit(50);
  if (error) throw error;

  // deno-lint-ignore no-explicit-any
  const match = (data ?? []).find((r: any) => {
    return (
      r.location?.slug === locationSlug &&
      r.location?.company?.slug === operatorSlug &&
      r.company_parking_type?.parking_type?.code === parkingTypeCode
    );
  });
  if (!match) return null;

  const companyId = (match as { location: { company: { id: string } } }).location.company.id;
  const { data: others } = await supabase
    .from("location")
    .select("id, name, slug")
    .eq("company_id", companyId)
    .neq("id", (match as { location: { id: string } }).location.id)
    .is("deleted_at", null)
    .limit(6);

  // deno-lint-ignore no-explicit-any
  const m = match as any;
  const amenitiesRaw = (m.location.amenities ?? [])
    // deno-lint-ignore no-explicit-any
    .map((a: any) => a.amenity)
    .filter(Boolean)
    // deno-lint-ignore no-explicit-any
    .sort((a: any, b: any) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

  return {
    id: m.id,
    capacity: m.capacity,
    is_active: m.is_active,
    company: m.location.company,
    location: {
      id: m.location.id,
      slug: m.location.slug,
      name: m.location.name,
      address: m.location.address,
      phone: m.location.phone,
      email: m.location.email,
      notice: m.location.notice,
      has_notice: m.location.has_notice,
      reservation_policy: m.location.reservation_policy,
      timezone: m.location.timezone,
      latitude: m.location.latitude != null ? Number(m.location.latitude) : null,
      longitude: m.location.longitude != null ? Number(m.location.longitude) : null,
      has_pcd_config: m.location.has_pcd_config,
      has_passenger_quantity: m.location.has_passenger_quantity,
    },
    parking_type: m.company_parking_type.parking_type,
    company_parking_type: {
      base_price: Number(m.company_parking_type.base_price),
    },
    amenities: amenitiesRaw,
    other_locations: (others ?? []) as { id: string; name: string; slug: string }[],
  };
}

/**
 * Serviços adicionais ativos disponíveis numa unidade (catálogo público).
 * Preço efetivo = price_override da unidade, senão base_price do serviço.
 */
export function useLocationAddOns(locationId: string | undefined) {
  return useQuery({
    queryKey: ["location-add-ons", locationId ?? "none"] as const,
    enabled: !!locationId,
    staleTime: 60_000,
    queryFn: async (): Promise<AddOnOption[]> => {
      const { data, error } = await supabase
        .from("location_add_on_service")
        .select(
          "price_override, add_on_service:add_on_service!inner(id, name, description, base_price, is_active, sort_order)",
        )
        .eq("location_id", locationId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? [])
        // deno-lint-ignore no-explicit-any
        .filter((r: any) => r.add_on_service?.is_active)
        // deno-lint-ignore no-explicit-any
        .sort((a: any, b: any) => (a.add_on_service.sort_order ?? 0) - (b.add_on_service.sort_order ?? 0))
        // deno-lint-ignore no-explicit-any
        .map((r: any) => ({
          id: r.add_on_service.id,
          name: r.add_on_service.name,
          description: r.add_on_service.description,
          price:
            r.price_override != null
              ? Number(r.price_override)
              : Number(r.add_on_service.base_price),
        }));
    },
  });
}

export function useListing(
  operatorSlug: string | undefined,
  locationSlug: string | undefined,
  parkingTypeCode: string | undefined,
  options?: { initialData?: ListingDetail },
) {
  return useQuery({
    queryKey: ["listing", operatorSlug, locationSlug, parkingTypeCode] as const,
    queryFn: () => fetchListing(operatorSlug!, locationSlug!, parkingTypeCode!),
    enabled: !!operatorSlug && !!locationSlug && !!parkingTypeCode,
    staleTime: 60_000,
    initialData: options?.initialData,
  });
}

export type SimulatedPrice = {
  price: number | null;
  old_price: number | null;
  /** Desconto automático aplicado (regra), com rótulo "-20%". Null se não houver. */
  discount: { amount: number; label: string } | null;
  days: number;
  error?: string | null;
};

/**
 * Simula preço chamando simulate_price RPC.
 * Recalcula automaticamente quando `args` mudam (com debounce no consumer).
 */
export function useSimulatePrice(args: {
  companySlug: string | undefined;
  locationSlug: string | undefined;
  parkingTypeCode: string | undefined;
  days: number;
}) {
  return useQuery({
    queryKey: ["simulate-price", args.companySlug, args.locationSlug, args.parkingTypeCode, args.days] as const,
    queryFn: async (): Promise<SimulatedPrice> => {
      const { data, error } = await supabase.rpc("simulate_price", {
        p_company: args.companySlug!,
        p_location: args.locationSlug!,
        p_parking_type: args.parkingTypeCode!,
        p_days: args.days,
      });
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      const r = data as any;
      return {
        price: r?.price != null ? Number(r.price) : null,
        old_price: r?.old_price != null ? Number(r.old_price) : null,
        discount: r?.discount
          ? { amount: Number(r.discount.amount), label: String(r.discount.label) }
          : null,
        days: args.days,
        error: r?.error ?? null,
      };
    },
    enabled: !!args.companySlug && !!args.locationSlug && !!args.parkingTypeCode && args.days > 0,
    staleTime: 30_000,
  });
}

/**
 * Pré-valida um cupom (RPC validate_coupon) sem criar reserva.
 * Requer sessão (a RPC usa auth.uid()); retorna preview do desconto ou error_code.
 */
export function useValidateCoupon() {
  return useMutation({
    mutationFn: async (args: {
      code: string;
      location_parking_type_id: string;
      check_in_at: string;
      check_out_at: string;
    }): Promise<CouponPreview> => {
      const { data, error } = await supabase.rpc("validate_coupon", {
        p_code: args.code,
        p_location_parking_type_id: args.location_parking_type_id,
        p_check_in_at: args.check_in_at,
        p_check_out_at: args.check_out_at,
      });
      if (error) throw new Error(error.message);
      // deno-lint-ignore no-explicit-any
      const r = data as any;
      return {
        valid: !!r?.valid,
        discount: Number(r?.discount ?? 0),
        subtotal: Number(r?.subtotal ?? 0),
        total_preview: Number(r?.total_preview ?? 0),
        code: r?.code ?? args.code.toUpperCase(),
        error_code: r?.error_code ?? null,
        discount_type: r?.discount_type,
        discount_value: r?.discount_value != null ? Number(r.discount_value) : undefined,
      };
    },
  });
}

/** Hook utilitário: debounce de um valor por X ms. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Cria booking via Edge Function /functions/v1/create-booking.
 */
export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      location_parking_type_id: string;
      check_in_at: string;
      check_out_at: string;
      vehicle_id?: string | null;
      passenger_count?: number | null;
      has_pcd?: boolean;
      add_on_service_ids?: string[];
      coupon_code?: string | null;
      origin?: string | null;
    }): Promise<{
      code: string;
      booking_id: string;
      total_amount: number;
      days: number;
      expires_at: string;
    }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Você precisa entrar pra reservar.");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-booking`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Falha (HTTP ${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });
}
