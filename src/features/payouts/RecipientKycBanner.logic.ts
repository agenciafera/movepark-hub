// Estado do banner de prova de vida do parceiro, isolado do componente para virar teste unitário.
//
// O gateway só libera o link de prova de vida quando o recebedor chega em `affiliation`
// (kyc_details = partially_denied / additional_documents_required). Antes disso ele fica em
// `registration`, que é análise em andamento e não pede nada do parceiro.
//
// O link vive 20 minutos, então a validade guardada em `kyc_url_expires_at` é quem decide entre
// mostrar o link e oferecer a reemissão. Sem ela o parceiro clicava num link morto sem saber.

/**
 * Status cru do gateway em que a prova de vida foi exigida e o link pode ser gerado.
 * Medido em produção em 30/07/2026 no recebedor `re_cms7wc1eievek0l9tfxnb8wz2`:
 * `registration` vem com `kyc_details = pending / in_analysis` e o `kyc_link` não responde 200;
 * `affiliation` vem com `partially_denied / additional_documents_required` e aí o link sai.
 * Trocar por `registration` inverte o banner: incomoda durante a análise e cala justamente
 * quando a prova de vida é exigida.
 */
const PROVIDER_STATUS_AWAITING_KYC = "affiliation";

export type KycBannerState =
  | { kind: "hidden" }
  | { kind: "ready"; url: string; expiresAt: string }
  | { kind: "expired" }
  | { kind: "preparing" };

/** Subset de `payout_recipient` que decide o banner. */
export interface KycBannerInput {
  status: string | null | undefined;
  kyc_url: string | null | undefined;
  kyc_url_expires_at: string | null | undefined;
  last_provider_status: string | null | undefined;
}

/**
 * Resolve o que o parceiro vê.
 *
 * `ready` exige link **e** validade no futuro. Link sem validade conhecida cai em `expired` de
 * propósito: é melhor oferecer um link novo do que mandar a pessoa tentar um que talvez já morreu.
 */
export function resolveKycBannerState(
  recipient: KycBannerInput | null | undefined,
  now: Date = new Date(),
): KycBannerState {
  if (!recipient) return { kind: "hidden" };

  const awaitingKyc =
    recipient.status === "action_required" ||
    recipient.last_provider_status?.toLowerCase() === PROVIDER_STATUS_AWAITING_KYC;
  if (!awaitingKyc) return { kind: "hidden" };

  const url = recipient.kyc_url?.trim();
  if (!url) return { kind: "preparing" };

  const expiresMs = recipient.kyc_url_expires_at
    ? Date.parse(recipient.kyc_url_expires_at)
    : Number.NaN;
  if (Number.isNaN(expiresMs) || expiresMs <= now.getTime()) return { kind: "expired" };

  return { kind: "ready", url, expiresAt: recipient.kyc_url_expires_at! };
}

/** Milissegundos que faltam para o link morrer, nunca negativo. */
export function kycMsRemaining(expiresAt: string, now: Date = new Date()): number {
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, ms - now.getTime());
}

/** `mm:ss` para o contador. Acima de 99 minutos satura, que é caso impossível aqui. */
export function formatKycCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const min = Math.min(99, Math.floor(total / 60));
  const sec = total % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
