/**
 * Regras de exibição da saúde da integração com o white-label (Manager).
 *
 * Fica fora dos componentes para ter teste: a versão anterior do card do espelho escondia o
 * bloco nas unidades hub e lia `error` como "ok", e as duas coisas passaram despercebidas
 * porque estavam dentro do JSX.
 *
 * Spec: docs/specs/shared-availability.md (§ Saúde da integração).
 */

export type MirrorStatus = "ok" | "divergent" | "error" | string | null | undefined;

export type Tone = "ok" | "warn" | "error" | "muted";

export type StatusView = { label: string; tone: Tone; detail?: string | null };

/**
 * O espelho de preço vale para toda vaga mapeada de empresa com site white-label, externa ou
 * hub. Desde 23/09/2026 a Edge espelha as duas; a tela só mostrava a externa, e nas três
 * unidades que vendem pelo Hub o admin não via o status nem tinha o botão.
 */
export function shouldShowMirror(args: {
  hasWlSite: boolean;
  categorySlug: string | null | undefined;
  productSlug: string | null | undefined;
}): boolean {
  return args.hasWlSite && !!args.categorySlug && !!args.productSlug;
}

export function mirrorStatusView(rule: {
  mirror_status?: MirrorStatus;
  mirror_verified_at?: string | null;
  mirror_error?: string | null;
} | null | undefined): StatusView {
  if (!rule || !rule.mirror_verified_at) return { label: "ainda não sincronizado", tone: "muted" };
  if (rule.mirror_status === "error") {
    return { label: "erro na última conferência", tone: "error", detail: rule.mirror_error ?? null };
  }
  if (rule.mirror_status === "divergent") return { label: "divergente", tone: "error" };
  return { label: "ok", tone: "ok" };
}

/** Horas desde um carimbo, ou null quando nunca houve. */
export function hoursSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (now.getTime() - t) / 3_600_000);
}

/** A conferência do espelho passou do limite (padrão 24h, o mesmo da saúde no banco). */
export function isMirrorStale(
  verifiedAt: string | null | undefined,
  now: Date = new Date(),
  limitHours = 24,
): boolean {
  const h = hoursSince(verifiedAt, now);
  return h === null || h > limitHours;
}

/** A reconciliação passou do limite (padrão 2h, o mesmo da saúde no banco). */
export function isReconcileStale(
  reconciledAt: string | null | undefined,
  now: Date = new Date(),
  limitMinutes = 120,
): boolean {
  const h = hoursSince(reconciledAt, now);
  return h === null || h * 60 > limitMinutes;
}

/** Estado da reconciliação de uma vaga, para a tabela da tela de saúde. */
export function reconcileStatusView(
  unit: {
    reconcile_expected: boolean;
    reconciled_at: string | null;
    reconcile_error: string | null;
    reconcile_error_at: string | null;
  },
  now: Date = new Date(),
): StatusView {
  if (!unit.reconcile_expected) return { label: "sync desligado", tone: "muted" };
  const erroDepoisDaLeitura =
    !!unit.reconcile_error &&
    (!unit.reconciled_at ||
      (!!unit.reconcile_error_at && unit.reconcile_error_at > unit.reconciled_at));
  if (erroDepoisDaLeitura) return { label: "erro", tone: "error", detail: unit.reconcile_error };
  if (isReconcileStale(unit.reconciled_at, now)) return { label: "atrasada", tone: "warn" };
  return { label: "em dia", tone: "ok" };
}

/** Estado da importação das reservas do site de uma empresa. */
export function importStatusView(
  imp: { last_ok_at: string | null; last_error: string | null; last_error_at: string | null },
  enabled: boolean,
  now: Date = new Date(),
): StatusView {
  if (!enabled) return { label: "desligada", tone: "muted" };
  const erroDepoisDaLeitura =
    !!imp.last_error &&
    (!imp.last_ok_at || (!!imp.last_error_at && imp.last_error_at > imp.last_ok_at));
  if (erroDepoisDaLeitura) return { label: "erro", tone: "error", detail: imp.last_error };
  if (isReconcileStale(imp.last_ok_at, now)) return { label: "atrasada", tone: "warn" };
  return { label: "em dia", tone: "ok" };
}

/** Badge do design system para cada tom. */
export const TONE_BADGE: Record<Tone, "confirmed" | "pending" | "cancelled" | "neutral"> = {
  ok: "confirmed",
  warn: "pending",
  error: "cancelled",
  muted: "neutral",
};

/** O que cada motivo da saúde quer dizer, na língua de quem vai resolver. */
export const HEALTH_REASON_LABEL: Record<string, string> = {
  entrega_falhou: "O site do parceiro recusou um envio e paramos de tentar.",
  entrega_atrasada: "Um envio está na fila há mais de uma hora.",
  reconciliacao_parada: "O Hub não lê as vendas do site do parceiro há mais de duas horas.",
  espelho_com_erro: "O espelho de preço falhou ao conferir uma vaga.",
  espelho_divergente: "O preço do Hub não bate com o do site do parceiro em alguma vaga.",
  espelho_atrasado: "Alguma vaga está sem conferência de preço há mais de 24 horas.",
  importacao_parada: "O Hub não traz as reservas do site de algum parceiro há mais de duas horas.",
};

export function healthReasonLabel(reason: string): string {
  return HEALTH_REASON_LABEL[reason] ?? `Motivo não catalogado: ${reason}`;
}

/** O id da reserva a partir do `event_id` da fila (`<uuid>[#n]:<op>`). */
export function bookingIdFromEventId(eventId: string): string {
  return eventId.split(":")[0].split("#")[0];
}
