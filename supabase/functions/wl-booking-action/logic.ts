// Decisões puras da Edge wl-booking-action (reservas-wl-no-hub.md § 10), sem rede nem banco.

export type ActionInput =
  | { action: "attendance"; wl_booking_id: string; status: "pendente" | "compareceu" | "no_show" }
  | {
    action: "license_plate";
    wl_booking_id: string;
    license_plate: string;
    reason: string;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
  };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida o corpo antes de gastar a chamada ao legado. Devolve a mensagem para a tela, ou o input. */
export function parseInput(raw: unknown): { ok: true; input: ActionInput } | { ok: false; error: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = String(o.wl_booking_id ?? "");
  if (!UUID.test(id)) return { ok: false, error: "Reserva inválida." };

  if (o.action === "attendance") {
    const status = String(o.status ?? "");
    if (!["pendente", "compareceu", "no_show"].includes(status)) {
      return { ok: false, error: "Situação de comparecimento inválida." };
    }
    return { ok: true, input: { action: "attendance", wl_booking_id: id, status: status as "pendente" } };
  }

  if (o.action === "license_plate") {
    const plate = String(o.license_plate ?? "").trim();
    const reason = String(o.reason ?? "").trim();
    if (!/^[A-Za-z0-9-]{7,8}$/.test(plate)) return { ok: false, error: "Placa inválida." };
    if (!reason) return { ok: false, error: "Conte o motivo da troca." };
    if (reason.length > 500) return { ok: false, error: "O motivo pode ter até 500 caracteres." };
    const opt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return {
      ok: true,
      input: {
        action: "license_plate",
        wl_booking_id: id,
        license_plate: plate,
        reason,
        brand: opt(o.brand),
        model: opt(o.model),
        color: opt(o.color),
      },
    };
  }

  return { ok: false, error: "Ação inválida." };
}

/** Recusa do contexto (permissão, chave desligada) em mensagem para quem clicou, e status HTTP. */
export function contextRefusal(reason: string): { status: number; error: string } {
  switch (reason) {
    case "disabled":
      return { status: 409, error: "As ações nas reservas do seu site ainda não estão ligadas." };
    case "not_found":
      return { status: 404, error: "Reserva não encontrada." };
    case "forbidden":
      return { status: 403, error: "Seu acesso não permite essa ação." };
    default:
      return { status: 400, error: "Ação inválida." };
  }
}

/** Código de recusa do legado (409 com data.code) em mensagem para a tela. */
export function legacyRefusalMessage(code: string): string {
  switch (code) {
    case "not_eligible":
      return "Só reserva paga aceita essa ação.";
    case "before_checkin":
      return "Só dá para marcar que o cliente chegou depois do horário de entrada.";
    case "empty_plate":
      return "Informe a nova placa.";
    case "empty_reason":
      return "Conte o motivo da troca.";
    case "not_found":
      return "O site não encontrou esse pedido.";
    case "invalid":
      return "O site recusou os dados enviados.";
    default:
      return "O site recusou a ação.";
  }
}
