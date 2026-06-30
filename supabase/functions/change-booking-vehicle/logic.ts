// Lógica pura de change-booking-vehicle (testável sem rede): parsing do payload.
// Aceita vehicle_id (cliente escolhe um veículo já cadastrado) OU license_plate (staff digita a
// placa direto no painel — criamos/achamos o veículo do titular).

export interface ChangeVehicleInput {
  bookingCode: string;
  vehicleId: string | null;
  licensePlate: string | null;
}

export function parseChangeVehicleInput(body: unknown): { input: ChangeVehicleInput | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const code = typeof b.booking_code === "string" ? b.booking_code.trim() : "";
  if (!code) return { input: null, error: "booking_code é obrigatório." };
  const vehicleId = typeof b.vehicle_id === "string" && b.vehicle_id.trim() ? b.vehicle_id.trim() : null;
  const licensePlate =
    typeof b.license_plate === "string" && b.license_plate.trim()
      ? b.license_plate.trim().toUpperCase().replace(/\s+/g, "")
      : null;
  if (!vehicleId && !licensePlate) {
    return { input: null, error: "Informe vehicle_id ou license_plate." };
  }
  return { input: { bookingCode: code, vehicleId, licensePlate } };
}
