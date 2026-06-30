// Lógica pura da visão de Recebedores (Manager): mapeia company+recebedor embutido, decide o que
// "precisa de atenção" (empresa que vende mas não está apta a receber → bloqueia o checkout) e
// ordena pendências primeiro. Testável sem Supabase/React.

import type { OnboardingStatus, PayoutRecipientStatus } from "@/types/domain";
import type { PayoutRequirement, RawCompanyRecipient } from "@/features/payouts/api";

export interface RecipientOverviewRow {
  companyId: string;
  companyName: string;
  onboardingStatus: OnboardingStatus;
  recipientStatus: PayoutRecipientStatus;
  /** Tem recebedor de fato criado no gateway (id externo presente). */
  hasRecipient: boolean;
  /** Tem dados de banco/KYC (`company_payout_account`) — pré-requisito para criar o recebedor. */
  hasKyc: boolean;
  externalRecipientId: string | null;
  kycUrl: string | null;
  requirements: PayoutRequirement[];
  /** Empresa vende (catálogo) mas não está apta a receber → bloqueia o pagamento. */
  needsAttention: boolean;
}

/** Empresas que podem vender (e portanto precisam de recebedor apto). */
export const SELLABLE_ONBOARDING: OnboardingStatus[] = ["approved", "in_progress", "active"];

const RECIPIENT_VALUES: PayoutRecipientStatus[] = [
  "draft",
  "pending",
  "action_required",
  "active",
  "refused",
  "suspended",
];

function asRecipientStatus(value: string | undefined): PayoutRecipientStatus {
  return (RECIPIENT_VALUES as string[]).includes(value ?? "")
    ? (value as PayoutRecipientStatus)
    : "draft";
}

/**
 * Normaliza um embed do PostgREST para array. Relações 1:1 (ex.: company_payout_account, cujo PK é
 * company_id) voltam como objeto único; 1:N voltam como array. Tratamos os dois.
 */
function toArray<T>(v: T[] | T | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Mapeia a linha crua (company + payout_recipient + company_payout_account) para o overview. */
export function mapRecipientRow(raw: RawCompanyRecipient): RecipientOverviewRow {
  const rec = toArray(raw.payout_recipient).find((r) => r.provider === "pagarme" && !r.deleted_at) ?? null;
  const recipientStatus = asRecipientStatus(rec?.status);
  const onboardingStatus = raw.onboarding_status as OnboardingStatus;
  const requirements = Array.isArray(rec?.requirements)
    ? (rec!.requirements as PayoutRequirement[])
    : [];
  const hasKyc = toArray(raw.company_payout_account).some((a) => !a.deleted_at);
  return {
    companyId: raw.id,
    companyName: raw.name,
    onboardingStatus,
    recipientStatus,
    hasRecipient: !!rec?.external_recipient_id,
    hasKyc,
    externalRecipientId: rec?.external_recipient_id ?? null,
    kycUrl: rec?.kyc_url ?? null,
    requirements,
    needsAttention:
      SELLABLE_ONBOARDING.includes(onboardingStatus) && recipientStatus !== "active",
  };
}

/** Pendências primeiro, depois por nome (pt-BR). */
export function sortRecipientRows(rows: RecipientOverviewRow[]): RecipientOverviewRow[] {
  return [...rows].sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    return a.companyName.localeCompare(b.companyName, "pt-BR");
  });
}

/** Mapeia + ordena de uma vez. */
export function buildRecipientOverview(raw: RawCompanyRecipient[]): RecipientOverviewRow[] {
  return sortRecipientRows(raw.map(mapRecipientRow));
}

export interface RecipientSummary {
  total: number;
  active: number;
  needsAttention: number;
}

export function summarizeRecipients(rows: RecipientOverviewRow[]): RecipientSummary {
  return {
    total: rows.length,
    active: rows.filter((r) => r.recipientStatus === "active").length,
    needsAttention: rows.filter((r) => r.needsAttention).length,
  };
}
