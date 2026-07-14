import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PartnerApplication } from "@/types/domain";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-partner`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const partnerApplicationsKeys = {
  all: ["partner-applications"] as const,
  list: () => [...partnerApplicationsKeys.all, "list"] as const,
};

export function usePartnerApplications() {
  return useQuery({
    queryKey: partnerApplicationsKeys.list(),
    queryFn: async (): Promise<PartnerApplication[]> => {
      const { data, error } = await supabase
        .from("company_onboarding")
        .select("*, company:company!inner(id, name, slug, onboarding_status, status)")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PartnerApplication[];
    },
  });
}

type PartnerAction = "approve" | "reject" | "resend_invite";

async function callApprovePartner(args: {
  company_id: string;
  action: PartnerAction;
  rejection_reason?: string | null;
}) {
  const { data: { session } } = await supabase.auth.getSession();
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
  return body as { ok: boolean; status: string; emailSent?: boolean; emailError?: string | null };
}

export function usePartnerAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: callApprovePartner,
    onSuccess: () => qc.invalidateQueries({ queryKey: partnerApplicationsKeys.all }),
  });
}
