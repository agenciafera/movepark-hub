// Chamado de atendimento (25/09/2026). Spec: docs/specs/chamado-de-atendimento.md
//
// O cliente abre pela Edge (que valida a reserva, avisa a equipe e abre a conversa no WhatsApp).
// A leitura é direta na tabela: RLS mostra ao cliente só os dele e à equipe todos.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SupportTicket } from "@/types/domain";
import type { TicketKind } from "./supportTicket.logic";

const OPEN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/open-support-ticket`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supportKeys = {
  all: ["support-ticket"] as const,
  byBooking: (bookingId: string) => [...supportKeys.all, "booking", bookingId] as const,
  openCount: () => [...supportKeys.all, "open-count"] as const,
};

/** Chamados de uma reserva, do mais novo para o mais velho (cliente vê os seus; hub_admin todos). */
export function useBookingSupportTickets(bookingId: string | undefined) {
  return useQuery({
    queryKey: supportKeys.byBooking(bookingId ?? ""),
    enabled: !!bookingId,
    queryFn: async (): Promise<SupportTicket[]> => {
      const { data, error } = await supabase
        .from("support_ticket")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Quantos chamados estão abertos (hub_admin; para os outros a RPC devolve 0). */
export function useOpenSupportTicketCount(enabled: boolean) {
  return useQuery({
    queryKey: supportKeys.openCount(),
    enabled,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("open_support_ticket_count");
      if (error) throw error;
      return data ?? 0;
    },
  });
}

/** Abre o chamado pela Edge. Devolve o código e se a confirmação saiu pelo WhatsApp. */
export function useOpenSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { booking_code: string; kind: TicketKind; message: string }): Promise<{ code: string; whatsapp: boolean }> => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre de novo.");
      const res = await fetch(OPEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${token}` },
        body: JSON.stringify(args),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string; whatsapp?: boolean };
      if (!res.ok) throw new Error(json.error ?? `Falha ao abrir o chamado (${res.status})`);
      return { code: json.code!, whatsapp: !!json.whatsapp };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.all }),
  });
}

/** A equipe encerra o chamado (RPC, hub_admin). Não devolve a conversa ao agente: isso é em Conversas. */
export function useCloseSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_close_support_ticket", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.all }),
  });
}
