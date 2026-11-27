/**
 * Formatação pura dos painéis do assistente (docs/specs/assistente-marketing-proativo.md § 4).
 * Datas chegam como AAAA-MM-DD e são cortadas como texto: passar por Date mudaria o dia no fuso de
 * Brasília.
 */

export function dataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function situacaoDaJanela(d: { abre_em_dias: number; janela_ate: string }, hoje?: string): string {
  if (hoje && d.janela_ate < hoje) return "a janela já passou";
  if (d.abre_em_dias > 1) return `abre em ${d.abre_em_dias} dias`;
  if (d.abre_em_dias === 1) return "abre amanhã";
  if (d.abre_em_dias === 0) return "abre hoje";
  return "aberta agora";
}

export function variacao(antes: number, depois: number): string | null {
  if (!antes) return null;
  const v = Math.round(((depois - antes) / antes) * 100);
  return `${v > 0 ? "+" : ""}${v}%`;
}

export function percentual(p: number | null | undefined): string {
  return p === null || p === undefined ? "" : `${String(p).replace(".", ",")}%`;
}

export type Oportunidade = {
  chave: string;
  titulo: string;
  por_que: string;
  publico: number;
  alcance_email: number;
  ticket_medio: number | null;
  pedido: string;
};

export function listaDeOportunidades(saida: unknown): Oportunidade[] {
  const l = (saida as { oportunidades?: unknown } | null)?.oportunidades;
  return Array.isArray(l) ? (l as Oportunidade[]) : [];
}
