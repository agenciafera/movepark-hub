import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Captura PROGRESSIVA do lead de parceiro (abandono). O passo 1 do modal salva
 * e-mail + WhatsApp na hora via /capture-partner-lead; a submissão completa segue
 * no /submit-partner-lead (ver leadApi). Ambas são públicas (bearer anon).
 */
const CAPTURE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture-partner-lead`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type PartnerLeadPartial = {
  contact_email: string;
  contact_phone?: string;
  contact_name?: string;
  company_name?: string;
  city?: string;
  state?: string;
  estimated_spots?: number | null;
  step?: number;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
  hp_field?: string;
};

async function capture(payload: PartnerLeadPartial): Promise<{ ok: boolean }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(CAPTURE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${session?.access_token ?? ANON}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Não foi possível salvar (HTTP ${res.status})`);
  return body as { ok: boolean };
}

export function useCapturePartnerLead() {
  return useMutation({ mutationFn: capture });
}
