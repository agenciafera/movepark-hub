// O que o Hub manda ao provedor sobre a reserva (docs/specs/integracoes.md § 5.5).
// Lógica pura, sem rede nem PDF, para ser testável isolada.

import type { ReserveInput } from "./types.ts";

/** Status em que ainda faz sentido mandar a reserva para a cancela. */
export const SENDABLE = new Set(["confirmed", "checked_in"]);

export const BOOKING_INPUT_SELECT =
  `id, code, status, check_in_at, check_out_at, total_amount, passenger_count, has_pcd,
   customer_first_name, customer_last_name, customer_name, customer_email, customer_phone, customer_tax_id,
   vehicle:vehicle(license_plate, model, color),
   items:booking_item(item_type, parking_type_id, parking_type:parking_type(name))`;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Linha de `booking` (com BOOKING_INPUT_SELECT) → o que o provedor recebe. */
// deno-lint-ignore no-explicit-any
export function bookingRowToReserveInput(b: any): ReserveInput {
  // deno-lint-ignore no-explicit-any
  const parking = (b.items ?? []).find((i: any) => i.item_type === "parking");
  let first = str(b.customer_first_name);
  let last = str(b.customer_last_name);
  if (!first && !last) {
    const parts = (str(b.customer_name) ?? "").split(/\s+/).filter(Boolean);
    first = parts.shift() ?? null;
    last = parts.length ? parts.join(" ") : null;
  }
  return {
    bookingCode: b.code,
    checkInAt: b.check_in_at,
    checkOutAt: b.check_out_at,
    plate: str(b.vehicle?.license_plate),
    firstName: first,
    lastName: last,
    email: str(b.customer_email),
    phone: str(b.customer_phone),
    taxId: str(b.customer_tax_id),
    totalAmount: Number(b.total_amount ?? 0),
    passengerCount: b.passenger_count ?? null,
    hasPcd: Boolean(b.has_pcd),
    vehicleModel: str(b.vehicle?.model),
    vehicleColor: str(b.vehicle?.color),
    parkingTypeId: parking?.parking_type_id ?? null,
    parkingTypeName: str(parking?.parking_type?.name),
  };
}
