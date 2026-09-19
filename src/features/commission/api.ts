// Regras de comissão por origem da venda (E0.3.12). Spec: docs/specs/comissao-por-origem.md
//
// A tabela `commission_rule` só é lida e escrita por hub_admin (RLS). A comissão de cada reserva
// é decidida no banco e congelada nela; a correção manual passa pela RPC, que grava o histórico.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CommissionRule } from "@/types/domain";
import { bookingsKeys } from "@/features/bookings/api";
import type { RulePayload } from "./rule.logic";

export const commissionKeys = {
  all: ["commission"] as const,
  rules: () => [...commissionKeys.all, "rules"] as const,
  channels: (companyId: string) => [...commissionKeys.all, "channels", companyId] as const,
  report: (from: string, to: string) => [...commissionKeys.all, "report", from, to] as const,
};

export type ChannelReport = {
  /** A partir de que fatia (%) do canal do parceiro a empresa entra em alerta. */
  alert_pct: number;
  companies: {
    company_id: string;
    company_name: string;
    paid_bookings: number;
    gmv_cents: number;
    movepark_cents: number;
    partner_gmv_cents: number;
    partner_share_pct: number;
    alert: boolean;
    channels: {
      channel: string;
      from_rule: boolean;
      paid_bookings: number;
      gmv_cents: number;
      movepark_cents: number;
      avg_take_rate_bps: number | null;
    }[];
  }[];
};

/** Vendas pagas por canal de comissão no período, com o alerta de concentração (hub_admin). */
export function useChannelReport(from: string, to: string) {
  return useQuery({
    queryKey: commissionKeys.report(from, to),
    queryFn: async (): Promise<ChannelReport> => {
      const { data, error } = await supabase.rpc("commission_channel_report", { p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as ChannelReport;
    },
  });
}

/** O que o estacionamento enxerga: as regras DELE (nunca as de outra empresa) e as páginas das unidades. */
export type PartnerChannels = {
  default_take_rate_bps: number;
  /** Janela de atribuição: quantos dias depois do clique a venda ainda conta. */
  window_days: number;
  rules: {
    id: string;
    name: string;
    utm_sources: string[];
    match_white_label: boolean;
    take_rate_bps: number;
    valid_until: string | null;
  }[];
  locations: { id: string; name: string; public_path: string }[];
};

export function usePartnerChannels(companyId: string | undefined) {
  return useQuery({
    queryKey: commissionKeys.channels(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<PartnerChannels> => {
      const { data, error } = await supabase.rpc("my_commission_channels", { p_company_id: companyId! });
      if (error) throw error;
      return data as unknown as PartnerChannels;
    },
  });
}

async function fetchRules(): Promise<CommissionRule[]> {
  const { data, error } = await supabase
    .from("commission_rule")
    .select("*")
    .is("deleted_at", null)
    .order("company_id", { ascending: true, nullsFirst: true })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function useCommissionRules(enabled = true) {
  return useQuery({ queryKey: commissionKeys.rules(), queryFn: fetchRules, enabled });
}

/** Cria (sem id) ou edita (com id). O trigger do banco normaliza os UTMs e recusa UTM repetido. */
export function useSaveCommissionRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RulePayload) => {
      const { id, ...fields } = payload;
      const q = id
        ? supabase.from("commission_rule").update(fields).eq("id", id).select().single()
        : supabase.from("commission_rule").insert(fields).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return data as CommissionRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commissionKeys.all }),
  });
}

/** Soft delete: reserva antiga continua apontando para a regra e mostrando o nome do canal. */
export function useDeleteCommissionRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("commission_rule")
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commissionKeys.all }),
  });
}

/** Corrige o canal de uma reserva ainda não paga. `ruleId` nulo devolve ao padrão do Hub. */
export function useSetBookingCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookingId: string; ruleId: string | null; reason: string }) => {
      const { data, error } = await supabase.rpc("admin_set_booking_commission", {
        p_booking_id: input.bookingId,
        p_rule_id: input.ruleId,
        p_reason: input.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: commissionKeys.all });
      qc.invalidateQueries({ queryKey: bookingsKeys.all });
    },
  });
}
