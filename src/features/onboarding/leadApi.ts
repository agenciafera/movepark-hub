import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-partner-lead`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type LeadPayload = {
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  tax_id?: string | null;
  contact_role?: string | null;
  city?: string | null;
  state?: string | null;
  estimated_spots?: number | null;
  message?: string | null;
  accept_terms: boolean;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
  hp_field?: string | null;
};

export type LeadResult = { ok: boolean; already_submitted?: boolean; company_id?: string };

async function submitLead(payload: LeadPayload): Promise<LeadResult> {
  // Função pública: gateway aceita o bearer anon (mesmo padrão do /search).
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${session?.access_token ?? ANON}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `Não foi possível enviar (HTTP ${res.status})`);
  }
  return body as LeadResult;
}

export function useSubmitLead() {
  return useMutation({ mutationFn: submitLead });
}
