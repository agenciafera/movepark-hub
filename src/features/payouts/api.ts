import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CompanyPayoutAccount, PayoutRecipient, PayoutWithdrawal } from "@/types/domain";
import type { toPayoutAccountPayload } from "./kyc";

/** Payload de upsert da conta de repasse (saída de `toPayoutAccountPayload`). */
export type PayoutAccountPayload = ReturnType<typeof toPayoutAccountPayload>;

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-recipient`;
const UPDATE_PAYOUT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-recipient-payout`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Pendência de KYC/verificação normalizada (coluna `requirements` jsonb). */
export type PayoutRequirement = { code: string; message: string };

export const payoutKeys = {
  all: ["payout-recipients"] as const,
  detail: (companyId: string) => [...payoutKeys.all, "detail", companyId] as const,
};

export const payoutAccountKeys = {
  all: ["payout-accounts"] as const,
  detail: (companyId: string) => [...payoutAccountKeys.all, "detail", companyId] as const,
};

async function fetchAccount(companyId: string): Promise<CompanyPayoutAccount | null> {
  const { data, error } = await supabase
    .from("company_payout_account")
    .select("*")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Lê a conta de repasse (banco/KYC) de uma empresa. */
export function usePayoutAccount(companyId: string | undefined) {
  return useQuery({
    queryKey: payoutAccountKeys.detail(companyId ?? ""),
    queryFn: () => fetchAccount(companyId!),
    enabled: !!companyId,
  });
}

/** Salva a conta de repasse como hub_admin (escrita direta via RLS admin_all). */
export function useSavePayoutAccountAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { company_id: string; payload: PayoutAccountPayload }) => {
      const { error } = await supabase
        .from("company_payout_account")
        .upsert({ company_id: args.company_id, ...args.payload, deleted_at: null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payoutAccountKeys.all });
      // O overview de recebedores depende do KYC (gate do "Criar recebedor") → refaz.
      qc.invalidateQueries({ queryKey: payoutKeys.all });
    },
  });
}

async function fetchRecipient(companyId: string): Promise<PayoutRecipient | null> {
  const { data, error } = await supabase
    .from("payout_recipient")
    .select("*")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export function useRecipient(companyId: string | undefined) {
  return useQuery({
    queryKey: payoutKeys.detail(companyId ?? ""),
    queryFn: () => fetchRecipient(companyId!),
    enabled: !!companyId,
  });
}

/** Linha crua do overview (company + recebedor embutido) — mapeada em finance-recipients.logic. */
type RawRecipient = {
  provider: string;
  status: string;
  external_recipient_id: string | null;
  kyc_url: string | null;
  requirements: unknown;
  deleted_at: string | null;
};
type RawAccount = { deleted_at: string | null };

export type RawCompanyRecipient = {
  id: string;
  name: string;
  onboarding_status: string;
  // PostgREST devolve 1:N como array e 1:1 como objeto — aceitamos os dois (normalizado na lógica).
  payout_recipient: RawRecipient[] | RawRecipient | null;
  company_payout_account: RawAccount[] | RawAccount | null;
};

/** Overview de recebedores por empresa (Manager, hub_admin) — uma linha por empresa. */
export function useRecipientsOverview() {
  return useQuery({
    queryKey: [...payoutKeys.all, "overview"] as const,
    queryFn: async (): Promise<RawCompanyRecipient[]> => {
      const { data, error } = await supabase
        .from("company")
        .select(
          "id, name, onboarding_status, payout_recipient(provider, status, external_recipient_id, kyc_url, requirements, deleted_at), company_payout_account(deleted_at)",
        )
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as RawCompanyRecipient[];
    },
  });
}

type SyncArgs = { company_id: string; action: "create" | "refresh"; provider?: string };

async function callSyncRecipient(args: SyncArgs) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sessão expirada. Entre novamente.");
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Falha (HTTP ${res.status})`);
  return body as {
    ok: boolean;
    status: string;
    external_recipient_id: string | null;
    kyc_url: string | null;
    requirements: PayoutRequirement[];
  };
}

export function useSyncRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: callSyncRecipient,
    onSuccess: () => qc.invalidateQueries({ queryKey: payoutKeys.all }),
  });
}

/** Config de repasse por empresa (E0.3.3): cadência de transferência e/ou antecipação. */
export type UpdatePayoutArgs = {
  company_id: string;
  transfer?: { enabled: boolean; interval: string; day: number } | null;
  anticipation?: {
    enabled: boolean;
    type: string;
    volume_percentage: number;
    delay: number | null;
    days: number[] | null;
  } | null;
};

export function useUpdateRecipientPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: UpdatePayoutArgs): Promise<{ ok: boolean; warning: string | null }> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Entre novamente.");
      const res = await fetch(UPDATE_PAYOUT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(args),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha (HTTP ${res.status})`);
      return body as { ok: boolean; warning: string | null };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: payoutKeys.all }),
  });
}

// ── Reconciliação do split / extrato de repasses (E0.3.3) ───────────────────

export type PayoutStatementLine = {
  booking_code: string;
  event_at: string;
  status: string;
  partner_cents: number;
  movepark_cents: number;
};

export type PayoutStatementCompany = {
  company_id: string;
  company_name: string;
  gross_partner_cents: number;
  refunded_partner_cents: number;
  net_partner_cents: number;
  movepark_commission_cents: number;
  paid_count: number;
  refunded_count: number;
  lines: PayoutStatementLine[] | null;
};

export type PayoutStatement = {
  period: { from: string; to: string };
  companies: PayoutStatementCompany[];
};

export type PayoutBalance = {
  company_id: string;
  net_partner_cents: number;
  withdrawn_cents: number;
  balance_cents: number;
};

/** Extrato de repasse reconciliado do split (RPC payout_statement). */
export function usePayoutStatement(args: {
  from: string;
  to: string;
  companyId?: string | null;
  includeLines?: boolean;
}) {
  return useQuery({
    queryKey: ["payout-statement", args.from, args.to, args.companyId ?? "all", !!args.includeLines],
    queryFn: async (): Promise<PayoutStatement> => {
      const { data, error } = await supabase.rpc("payout_statement", {
        p_from: args.from,
        p_to: args.to,
        p_company_id: args.companyId ?? undefined,
        p_include_lines: args.includeLines ?? false,
      });
      if (error) throw error;
      return data as unknown as PayoutStatement;
    },
  });
}

/** Saques (transferências) registrados — RLS escopa por empresa. */
export function usePayoutWithdrawals(companyId?: string) {
  return useQuery({
    queryKey: ["payout-withdrawals", companyId ?? "all"],
    queryFn: async (): Promise<PayoutWithdrawal[]> => {
      let q = supabase
        .from("payout_withdrawal")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (companyId) q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PayoutWithdrawal[];
    },
  });
}

/** Saldo a repassar = líquido − saques pagos (RPC payout_balance). */
export function usePayoutBalance(companyId: string | undefined) {
  return useQuery({
    queryKey: ["payout-balance", companyId ?? ""],
    enabled: !!companyId,
    queryFn: async (): Promise<PayoutBalance> => {
      const { data, error } = await supabase.rpc("payout_balance", { p_company_id: companyId! });
      if (error) throw error;
      return data as unknown as PayoutBalance;
    },
  });
}
