// Validação pura do payload de evento WPS (pátio) — testável sem rede (E2.6.1).
// Contrato versionado: { version, event_id, type, occurred_at?, location_ref?, plate?, booking_code? }

export type WpsEventType = "vehicle.entered" | "vehicle.exited";

export interface WpsEventInput {
  version: string;
  event_id: string;
  type: WpsEventType;
  occurred_at: string | null;
  location_ref: string | null;
  plate: string | null;
  booking_code: string | null;
}

export type WpsParse = { ok: true; value: WpsEventInput } | { ok: false; error: string };

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function parseWpsEvent(body: Record<string, unknown>): WpsParse {
  const type = String(body.type ?? "");
  if (type !== "vehicle.entered" && type !== "vehicle.exited") {
    return { ok: false, error: "type deve ser 'vehicle.entered' ou 'vehicle.exited'." };
  }
  const event_id = str(body.event_id);
  if (!event_id) return { ok: false, error: "event_id é obrigatório." };

  const plate = str(body.plate);
  const booking_code = str(body.booking_code);
  if (!plate && !booking_code) {
    return { ok: false, error: "Informe 'plate' (ANPR) ou 'booking_code'." };
  }

  return {
    ok: true,
    value: {
      version: str(body.version) ?? "1",
      event_id,
      type: type as WpsEventType,
      occurred_at: str(body.occurred_at),
      location_ref: str(body.location_ref),
      plate,
      booking_code,
    },
  };
}
