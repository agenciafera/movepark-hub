// Lógica pura de update-recipient-payout (E0.3.3): valida a config de repasse por empresa que o
// hub_admin manda (cadência de transferência + antecipação automática). Testável sem rede.

import {
  clampVolume,
  isValidAnticipationType,
  isValidInterval,
  isValidTransferDay,
} from "../_shared/payments/payoutConfig.ts";

export interface UpdatePayoutInput {
  companyId: string;
  transfer: { enabled: boolean; interval: string; day: number } | null;
  anticipation:
    | { enabled: boolean; type: string; volumePercentage: number; delay: number | null; days: number[] | null }
    | null;
}

export function parseUpdatePayoutInput(body: unknown): { input: UpdatePayoutInput | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const companyId = typeof b.company_id === "string" ? b.company_id.trim() : "";
  if (!companyId) return { input: null, error: "company_id é obrigatório." };

  let transfer: UpdatePayoutInput["transfer"] = null;
  if (b.transfer && typeof b.transfer === "object") {
    const t = b.transfer as Record<string, unknown>;
    const interval = String(t.interval ?? "");
    if (!isValidInterval(interval)) {
      return { input: null, error: "Recorrência inválida (Daily/Weekly/Monthly)." };
    }
    const day = Math.round(Number(t.day ?? 0)) || 0;
    if (!isValidTransferDay(interval, day)) {
      return { input: null, error: "Dia inválido para a recorrência escolhida." };
    }
    transfer = { enabled: t.enabled !== false, interval, day };
  }

  let anticipation: UpdatePayoutInput["anticipation"] = null;
  if (b.anticipation && typeof b.anticipation === "object") {
    const a = b.anticipation as Record<string, unknown>;
    const enabled = a.enabled === true;
    const type = String(a.type ?? "full");
    if (enabled && !isValidAnticipationType(type)) {
      return { input: null, error: "Tipo de antecipação inválido (full/1025)." };
    }
    const volumePercentage = clampVolume(Number(a.volume_percentage ?? 100));
    const delay = a.delay == null || a.delay === "" ? null : Math.round(Number(a.delay));
    const rawDays = Array.isArray(a.days) ? a.days : [];
    const days = rawDays.map((d) => Math.round(Number(d))).filter((d) => d >= 1 && d <= 31);
    anticipation = { enabled, type, volumePercentage, delay, days: days.length ? days : null };
  }

  if (!transfer && !anticipation) return { input: null, error: "Nada para atualizar." };
  return { input: { companyId, transfer, anticipation } };
}

/** Colunas do payout_recipient a gravar (só o que veio). */
export function toRecipientColumns(input: UpdatePayoutInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.transfer) {
    patch.transfer_enabled = input.transfer.enabled;
    patch.transfer_interval = input.transfer.interval;
    patch.transfer_day = input.transfer.day;
  }
  if (input.anticipation) {
    patch.anticipation_enabled = input.anticipation.enabled;
    patch.anticipation_type = input.anticipation.type;
    patch.anticipation_volume_percentage = input.anticipation.volumePercentage;
    patch.anticipation_delay = input.anticipation.delay;
    patch.anticipation_days = input.anticipation.days;
  }
  return patch;
}
