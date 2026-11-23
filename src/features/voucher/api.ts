import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { untypedRpc } from "@/lib/untypedRpc";
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
export function useBookingByCode(code: string | undefined, opts: { counter?: boolean } = {}) {
  const counter = opts.counter ?? false;
  return useQuery({
    queryKey: code ? [...voucherKeys.byCode(code), counter] : ["voucher-booking", "none"],
    enabled: !!code,
    staleTime: 10_000,
    queryFn: async (): Promise<VoucherBooking | null> => {
      if (counter) {
        // Balcão (sem `finance:read`): a reserva vem da RPC `operator_booking_by_code`, sem valor.
        // O voucher do portão confere placa, datas e código, nunca o preço.
        const { data, error } = await untypedRpc("operator_booking_by_code", {
          p_code: code!,
          p_only_active: true,
          p_items: true,
        });
        if (error) throw new Error(error.message);
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
          total_amount: 0,
          profile_name: null,
          vehicle: r.vehicle
            ? { license_plate: r.vehicle.license_plate, model: r.vehicle.model, color: r.vehicle.color }
            : null,
          location: {
            name: r.location.name,
            address: r.location.address ?? null,
            company: { name: r.location.company.name },
          },
          parking_type_name: parkingItem?.parking_type?.name ?? null,
        };
      }
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
 * O trigger `booking_guard_write_allowlist` só aceita status, carimbos de operação e notas aqui:
 * coluna nova neste PATCH precisa entrar na allowlist por migration (docs/specs/booking-flow.md).
 */
export function useVoucherCheckIn(code: string | undefined, opts: { counter?: boolean } = {}) {
  const qc = useQueryClient();
  const counter = opts.counter ?? false;
  return useMutation({
    mutationFn: async (bookingId: string) => {
      if (counter) {
        // Balcão (sem `finance:read`): o UPDATE direto não acha a linha (a policy de SELECT não a
        // libera), então a marcação vai pela RPC, que confere `bookings:write`/`bookings:checkin`.
        const { error } = await untypedRpc("operator_set_booking_status", {
          p_booking_id: bookingId,
          p_status: "checked_in",
          p_checked_in_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        return;
      }
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
