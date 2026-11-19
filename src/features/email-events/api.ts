import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { EmailEvent } from "@/types/domain";
import { TIPOS_PROBLEMA } from "./logic";

/**
 * Eventos de e-mail do Amazon SES (19/11/2026), para a tela /manager/emails.
 *
 * A tabela `email_event` só concede SELECT, e só a hub_admin (RLS). Quem grava é a Edge
 * `ses-events`, com service_role, a partir do que o SNS entrega. Ver docs/specs/email-eventos-ses.md.
 */

export type EmailEventRow = Omit<EmailEvent, "raw">;

export interface EmailEventFilters {
  /** Trecho do endereço do destinatário. Vazio = todos. */
  recipient: string;
  /** Só devolução, reclamação, recusa e atraso (sem a entrega que deu certo). */
  onlyProblems: boolean;
}

export const emailEventsKeys = {
  all: ["email-events"] as const,
  list: (f: EmailEventFilters) => [...emailEventsKeys.all, "list", f] as const,
};

const baseSelect =
  "id, sns_message_id, event_type, recipient, ses_message_id, subject, sender, bounce_type, bounce_subtype, diagnostic, occurred_at, created_at";

/** Escapa os curingas do ILIKE para a busca achar o texto como foi digitado. */
function semCuringa(t: string): string {
  return t.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function fetchEmailEvents(f: EmailEventFilters): Promise<EmailEventRow[]> {
  let q = supabase.from("email_event").select(baseSelect).order("occurred_at", { ascending: false }).limit(300);
  const termo = f.recipient.trim().toLowerCase();
  if (termo) q = q.ilike("recipient", `%${semCuringa(termo)}%`);
  if (f.onlyProblems) q = q.in("event_type", [...TIPOS_PROBLEMA, "delivery_delay"]);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as EmailEventRow[];
}

/** Admin (hub_admin): os últimos 300 eventos, do mais novo para o mais antigo. */
export function useEmailEvents(f: EmailEventFilters) {
  return useQuery({ queryKey: emailEventsKeys.list(f), queryFn: () => fetchEmailEvents(f) });
}
