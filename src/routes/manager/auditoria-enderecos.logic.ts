import type { LocationAddressAuditRow } from "@/types/domain";

/**
 * Lógica pura da tela de auditoria de endereços, separada para ter teste sem montar a árvore.
 * Spec: docs/specs/auditoria-enderecos.md
 */

/** Cada sinal da triagem em português, porque a lista é lida por gente, não por máquina. */
export const FLAG_LABEL: Record<string, string> = {
  sem_geo: "sem coordenada",
  sem_destino: "sem destino",
  sem_place_id: "sem Place ID",
  place_id_nao_e_estabelecimento: "Place ID é de endereço",
  longe_do_destino: "longe do destino",
  endereco_incompleto: "endereço incompleto",
  endereco_sem_numero: "endereço sem número",
  endereco_duplicado: "mesma porta de outra unidade",
  pino_duplicado: "pino colado em outra unidade",
};

/** Os tones do Badge do design system (DESIGN.md §5). */
export type StatusTone = "confirmed" | "completed" | "pending" | "cancelled" | "noshow" | "neutral";

/**
 * O rótulo do veredito.
 *
 * "Conferido" ganha de tudo: uma unidade já revisada não pode voltar a gritar na lista só
 * porque a verificação seguinte reencontrou a mesma divergência conhecida.
 */
export function statusLabel(row: LocationAddressAuditRow): {
  label: string;
  tone: StatusTone;
} {
  if (row.decision === "applied") return { label: "corrigido", tone: "completed" };
  if (row.decision === "dismissed") return { label: "conferido", tone: "neutral" };

  switch (row.verify_status) {
    case "divergent":
      return { label: "divergente", tone: "cancelled" };
    case "no_match":
      return { label: "sem correspondência", tone: "pending" };
    case "error":
      return { label: "falha na consulta", tone: "noshow" };
    case "ok":
      return { label: "bate com o Google", tone: "confirmed" };
    default:
      return { label: "não verificado", tone: "neutral" };
  }
}

/**
 * Só dá para aplicar o que o Google devolveu de fato.
 *
 * Sem coordenada proposta não há o que aplicar, e o botão precisa dizer isso ficando
 * desligado. Latitude e longitude andam juntas porque a RPC recusa aplicar uma só: meia
 * coordenada produz um pino em lugar nenhum.
 */
export function temPropostaAplicavel(row: LocationAddressAuditRow): boolean {
  const temCoordenada = row.match_latitude !== null && row.match_longitude !== null;
  const temEndereco = typeof row.match_address === "string" && row.match_address.length > 0;
  return temCoordenada || temEndereco;
}
