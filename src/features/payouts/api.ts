import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CompanyPayoutAccount, PayoutRecipient } from "@/types/domain";
import type { toPayoutAccountPayload } from "./kyc";

/** Payload de upsert da conta de repasse (saída de `toPayoutAccountPayload`). */
export type PayoutAccountPayload = ReturnType<typeof toPayoutAccountPayload>;

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-recipient`;
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
    onSuccess: () => qc.invalidateQueries({ queryKey: payoutAccountKeys.all }),
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
