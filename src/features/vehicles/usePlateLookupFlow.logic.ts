// Máquina de estados pura do fluxo de consulta de placa (testável sem React).
// idle → looking_up → found | not_found | error ; e o ramo manual (cadastro à mão).

/** Veículo devolvido pela Edge lookup-vehicle-plate (espelha NormalizedVehicle do backend). */
export interface LookedUpVehicle {
  license_plate: string;
  model: string | null;
  color: string;
  raw_color: string | null;
  brand: string | null;
  year: string | null;
  fuel: string | null;
}

export type LookupStatus = "idle" | "looking_up" | "found" | "not_found" | "error" | "manual";

export interface FlowState {
  status: LookupStatus;
  vehicle: LookedUpVehicle | null;
  error: string | null;
}

export type FlowEvent =
  | { type: "RESET" } // volta a digitar a placa (limpa resultado)
  | { type: "LOOKUP_START" }
  | { type: "LOOKUP_FOUND"; vehicle: LookedUpVehicle }
  | { type: "LOOKUP_NOT_FOUND" }
  | { type: "LOOKUP_ERROR"; message: string }
  | { type: "MANUAL" }; // cai no cadastro manual

export const initialFlowState: FlowState = { status: "idle", vehicle: null, error: null };

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case "RESET":
      return initialFlowState;
    case "LOOKUP_START":
      return { status: "looking_up", vehicle: null, error: null };
    case "LOOKUP_FOUND":
      return { status: "found", vehicle: event.vehicle, error: null };
    case "LOOKUP_NOT_FOUND":
      return { status: "not_found", vehicle: null, error: null };
    case "LOOKUP_ERROR":
      return { status: "error", vehicle: null, error: event.message };
    case "MANUAL":
      return { status: "manual", vehicle: null, error: null };
    default:
      return state;
  }
}

/** Placa BR (7 chars): antiga ABC1234 ou Mercosul ABC1D23. */
const PLATE_RE = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/;

/** Deixa só A-Z0-9 em maiúsculo, no máximo 7 chars. */
export function normalizePlate(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

/** true se a placa (já normalizada) tem formato BR válido. */
export function isValidPlateBR(plate: string): boolean {
  return PLATE_RE.test(plate);
}

/** Dispara a consulta automática só quando ocioso e com placa válida completa. */
export function shouldAutoLookup(normalizedPlate: string, status: LookupStatus): boolean {
  return status === "idle" && isValidPlateBR(normalizedPlate);
}
