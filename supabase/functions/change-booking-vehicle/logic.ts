// Lógica pura de change-booking-vehicle (testável sem rede): parsing do payload.

export interface ChangeVehicleInput {
  bookingCode: string;
  vehicleId: string;
}

/** Valida { booking_code, vehicle_id }. */
export function parseChangeVehicleInput(body: unknown): { input: ChangeVehicleInput | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const code = typeof b.booking_code === "string" ? b.booking_code.trim() : "";
  if (!code) return { input: null, error: "booking_code é obrigatório." };
  const vehicleId = typeof b.vehicle_id === "string" ? b.vehicle_id.trim() : "";
  if (!vehicleId) return { input: null, error: "vehicle_id é obrigatório." };
  return { input: { bookingCode: code, vehicleId } };
}
