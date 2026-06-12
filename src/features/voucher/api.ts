import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { BookingStatus } from "@/types/domain";

export type VoucherBooking = {
  id: string;
  code: string;
  status: BookingStatus;
  check_in_at: string;
  check_out_at: string;
  checked_in_at: string | null;
  total_amount: number;
  profile_name: string | null;
  vehicle: { license_plate: string; model: string | null; color: string | null } | null;
  location: { name: string; address: string | null; company: { name: string } };
  parking_type_name: string | null;
};

export const voucherKeys = {
  byCode: (code: string) => ["voucher-booking", code] as const,
};

/**
 * Lê a reserva pelo código. A RLS escopa: dono OU operador da empresa (OU hub_admin).
 * Operador comum não enxerga o nome do cliente (profiles é owner/hub_admin) — usamos
 * placa + datas + código para conferência no portão.
 */
export function useBookingByCode(code: string | undefined) {
  return useQuery({
    queryKey: code ? voucherKeys.byCode(code) : ["voucher-booking", "none"],
    enabled: !!code,
    staleTime: 10_000,
    queryFn: async (): Promise<VoucherBooking | null> => {
      const { data, error } = await supabase
        .from("booking")
        .select(
          `id, code, status, check_in_at, check_out_at, checked_in_at, total_amount,
           profile:profiles(full_name),
           location:location!inner(name, address, company:company!inner(name)),
           vehicle:vehicle(license_plate, model, color),
           items:booking_item(item_type, parking_type:parking_type(name))`,
        )
        .eq("code", code!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // deno-lint-ignore no-explicit-any
      const r = data as any;
      // deno-lint-ignore no-explicit-any
      const parkingItem = (r.items ?? []).find((i: any) => i.item_type === "parking");
      return {
        id: r.id,
        code: r.code,
        status: r.status,
        check_in_at: r.check_in_at,
        check_out_at: r.check_out_at,
        checked_in_at: r.checked_in_at,
        total_amount: Number(r.total_amount),
        profile_name: r.profile?.full_name ?? null,
        vehicle: r.vehicle
          ? { license_plate: r.vehicle.license_plate, model: r.vehicle.model, color: r.vehicle.color }
          : null,
        location: {
          name: r.location.name,
          address: r.location.address,
          company: { name: r.location.company.name },
        },
        parking_type_name: parkingItem?.parking_type?.name ?? null,
      };
    },
  });
}

/**
 * Registra a entrada: confirmed → checked_in + checked_in_at = now.
 * UPDATE direto gateado pela RLS `booking_operator_update` (operador da empresa / hub_admin).
 */
export function useVoucherCheckIn(code: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from("booking")
        .update({ status: "checked_in", checked_in_at: new Date().toISOString() })
        .eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (code) qc.invalidateQueries({ queryKey: voucherKeys.byCode(code) });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
