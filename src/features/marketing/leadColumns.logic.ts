import { formatBRL } from "@/lib/format";
import type { MarketingLeadRow } from "@/types/domain";
import { cohortLabel, growthStageLabel } from "./cohorts";

/**
 * Catálogo de colunas da lista de leads. O usuário escolhe quais aparecem, e a escolha é gravada
 * em `marketing_pipeline.column_prefs`.
 *
 * Separado do componente para a resolução das preferências ter teste: a lista de colunas salva
 * envelhece (coluna renomeada, coluna removida numa versão nova) e a tela não pode quebrar nem
 * ficar vazia por causa de uma preferência antiga.
 */

export type LeadColumnKey =
  | "display_name"
  | "email"
  | "phone"
  | "location_name"
  | "stage_name"
  | "cohort"
  | "growth_stage"
  | "bookings_count"
  | "total_spent"
  | "avg_ticket"
  | "days_since_last"
  | "subscription_candidate"
  | "vehicle_model"
  | "value_cents"
  | "source"
  | "created_at";

export type LeadColumnDef = {
  key: LeadColumnKey;
  label: string;
  align?: "left" | "right";
  /** Coluna que o usuário não pode esconder: sem ela a linha não se identifica. */
  locked?: boolean;
};

export const LEAD_COLUMNS: LeadColumnDef[] = [
  { key: "display_name", label: "Nome", locked: true },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Telefone" },
  { key: "location_name", label: "Estacionamento" },
  { key: "stage_name", label: "Etapa" },
  { key: "cohort", label: "Perfil" },
  { key: "growth_stage", label: "Growth" },
  { key: "bookings_count", label: "Reservas", align: "right" },
  { key: "total_spent", label: "Total gasto", align: "right" },
  { key: "avg_ticket", label: "Ticket médio", align: "right" },
  { key: "days_since_last", label: "Dias sem comprar", align: "right" },
  { key: "subscription_candidate", label: "Assinante em potencial" },
  { key: "vehicle_model", label: "Veículo" },
  { key: "value_cents", label: "Valor do lead", align: "right" },
  { key: "source", label: "Origem" },
  { key: "created_at", label: "Criado em" },
];

export const DEFAULT_LEAD_COLUMNS: LeadColumnKey[] = [
  "display_name",
  "email",
  "location_name",
  "cohort",
  "bookings_count",
  "total_spent",
  "days_since_last",
];

export function columnDef(key: string): LeadColumnDef | undefined {
  return LEAD_COLUMNS.find((c) => c.key === key);
}

/**
 * Resolve as colunas visíveis a partir do que está gravado.
 *
 * Três defesas, todas por causa de preferência velha no banco:
 *   a) chave desconhecida é descartada (coluna que não existe mais não pode quebrar o render);
 *   b) coluna travada entra sempre, e na frente, mesmo que não esteja na preferência;
 *   c) preferência vazia cai no padrão, senão a tabela apareceria sem nenhuma coluna.
 */
export function resolveColumns(saved: unknown): LeadColumnDef[] {
  const bruto = Array.isArray(saved) ? saved.map(String) : [];
  const validas = bruto.filter((k): k is LeadColumnKey => Boolean(columnDef(k)));
  const escolhidas = validas.length > 0 ? validas : DEFAULT_LEAD_COLUMNS;

  const travadas = LEAD_COLUMNS.filter((c) => c.locked).map((c) => c.key);
  const finais = [...travadas, ...escolhidas.filter((k) => !travadas.includes(k))];

  // `Set` remove repetição de uma preferência salva duas vezes.
  return [...new Set(finais)].map((k) => columnDef(k)).filter((c): c is LeadColumnDef => Boolean(c));
}

/** Alterna uma coluna. Coluna travada não sai, então a função devolve a lista intacta. */
export function toggleColumn(atual: LeadColumnKey[], key: LeadColumnKey): LeadColumnKey[] {
  if (columnDef(key)?.locked) return atual;
  return atual.includes(key) ? atual.filter((k) => k !== key) : [...atual, key];
}

/** Valor já formatado de uma célula. Centralizado para kanban e lista não divergirem. */
export function cellValue(lead: MarketingLeadRow, key: LeadColumnKey): string {
  switch (key) {
    case "display_name":
      return lead.display_name || lead.email || lead.phone || "Sem nome";
    case "email":
      return lead.email ?? "-";
    case "phone":
      return lead.phone ?? "-";
    case "location_name":
      return lead.location_name ?? "-";
    case "stage_name":
      return lead.stage_name;
    case "cohort":
      return cohortLabel(lead.cohort);
    case "growth_stage":
      return growthStageLabel(lead.growth_stage);
    case "bookings_count":
      return String(lead.bookings_count);
    case "total_spent":
      return formatBRL(lead.total_spent);
    case "avg_ticket":
      return formatBRL(lead.avg_ticket);
    case "days_since_last":
      return lead.days_since_last == null ? "-" : String(lead.days_since_last);
    case "subscription_candidate":
      return lead.subscription_candidate ? "Sim" : "Não";
    case "vehicle_model":
      return lead.vehicle_model ?? "-";
    case "value_cents":
      return formatBRL((lead.value_cents ?? 0) / 100);
    case "source":
      return lead.source;
    case "created_at":
      return new Date(lead.created_at).toLocaleDateString("pt-BR");
    default:
      return "-";
  }
}
