// Estado do banner de prova de vida do parceiro, isolado do componente para virar teste unitário.
//
// O gateway só libera o link de prova de vida quando o recebedor chega em `affiliation`
// (kyc_details = partially_denied / additional_documents_required). Antes disso ele fica em
// `registration`, que é análise em andamento e não pede nada do parceiro. Entre "o gateway pediu"
// e "o link chegou" existe uma janela real (a Edge busca o link no poll, não no webhook), e é
// nessa janela que o parceiro ficava sem ver nada na tela.

/** Status cru do gateway em que a prova de vida foi exigida e o link pode ser gerado. */
const PROVIDER_STATUS_AWAITING_KYC = "registration";

export type KycBannerState =
  | { kind: "hidden" }
  | { kind: "ready"; url: string }
  | { kind: "preparing" };

/** Subset de `payout_recipient` que decide o banner. */
export interface KycBannerInput {
  status: string | null | undefined;
  kyc_url: string | null | undefined;
  last_provider_status: string | null | undefined;
}

/**
 * Resolve o que o parceiro vê. `ready` exige status `action_required` **e** link: o link fica
 * guardado na linha e não é limpo quando a ficha é aprovada, então mostrar só por ter `kyc_url`
 * exibiria um link morto para quem já passou.
 */
export function resolveKycBannerState(
  recipient: KycBannerInput | null | undefined,
): KycBannerState {
  if (!recipient) return { kind: "hidden" };

  const url = recipient.kyc_url?.trim();
  if (recipient.status === "action_required" && url) return { kind: "ready", url };

  const awaitingKyc =
    recipient.status === "action_required" ||
    recipient.last_provider_status?.toLowerCase() === PROVIDER_STATUS_AWAITING_KYC;

  return awaitingKyc ? { kind: "preparing" } : { kind: "hidden" };
}
