// Troca de data ou de placa mandada de novo à cancela (docs/specs/integracoes.md § 5.8).
// Lógica pura: lê o que o trigger `integration_enqueue_booking_change` gravou na entrega e o que a
// RPC `integration_store_access_code` devolveu.

/** O que a cancela tinha antes da troca. */
export interface DeliveryChange {
  previousCheckInAt: string | null;
  previousCheckOutAt: string | null;
  previousPlate: string | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Entrega nascida de uma troca (payload `reason: "change"`), ou null para a entrega da confirmação. */
export function deliveryChange(payload: unknown): DeliveryChange | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.reason !== "change") return null;
  const prev = (p.previous && typeof p.previous === "object" ? p.previous : {}) as Record<string, unknown>;
  return {
    previousCheckInAt: str(prev.check_in_at),
    previousCheckOutAt: str(prev.check_out_at),
    previousPlate: str(prev.plate),
  };
}

/** Resposta da RPC `integration_store_access_code`. */
export interface StoredCode {
  /** Um código novo passou a valer. */
  stored: boolean;
  /** O código aposentado, que a unidade precisa bloquear no provedor. */
  previousCode: string | null;
}

export function parseStoredCode(data: unknown): StoredCode {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return { stored: d.stored === true, previousCode: str(d.previous_code) };
}
