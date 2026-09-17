import { diaDoCarimbo } from "@/features/blog/priceFreshness.logic";
import type { Section } from "./types";

/**
 * A seção viva da /metodologia (Conteúdo 29).
 *
 * A página promete dizer de onde vem cada número e com que frequência ele muda. Uma tabela de
 * datas escrita à mão contradiria a própria página no primeiro mês, então as datas saem da
 * mesma RPC que carimba o preço no resto do site (`destination_price_freshness`).
 *
 * São duas datas por destino, e elas não são a mesma coisa:
 *
 * - **mudou em**: o dia em que a tabela daquele parceiro mudou de verdade (`mirror_sampled_at`).
 * - **conferida em**: o dia da última passada do espelhamento, que roda de 3 em 3 horas mesmo
 *   quando o preço não muda (`mirror_verified_at`).
 *
 * Separar as duas é o ponto da seção. Publicar só a segunda foi o defeito que o Conteúdo 29
 * consertou: o carimbo dizia "hoje" todo dia, porque media o robô e não o preço.
 */

export type FrescorDestino = {
  slug: string;
  /** Nome curto do destino, como aparece no resto do site ("Viracopos (VCP)"). */
  nome: string;
  /** ISO da mudança da tabela. Sem isso a linha não entra: data faltando não vira "hoje". */
  mudouEm: string | null;
  /** ISO da última conferência. Ausente só esconde a segunda metade da frase. */
  conferidaEm: string | null;
};

/**
 * `2026-08-10T14:25:36+00:00` vira `10/08/2026`.
 *
 * O corte no dia é do `diaDoCarimbo`, que já resolve a virada de fuso: ler um ISO com horário
 * e formatar direto devolvia a véspera em Brasília, e a página inteira existe para não errar data.
 */
export function formatarDia(iso: string | null | undefined): string | null {
  const dia = diaDoCarimbo(iso);
  if (!dia) return null;
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}

/** "Mudou em 10/08/2026, conferida em 17/09/2026." */
export function linhaDeFrescor(linha: FrescorDestino): string | null {
  const mudou = formatarDia(linha.mudouEm);
  if (!mudou) return null;
  const conferida = formatarDia(linha.conferidaEm);
  return conferida
    ? `Mudou em ${mudou}, conferida em ${conferida}.`
    : `Mudou em ${mudou}.`;
}

/**
 * Enxerta a tabela de datas na seção de frescor.
 *
 * A prosa da seção é estática e fica de pé sozinha: se a RPC falhar no build, a página perde a
 * tabela e não a explicação. O contrário (seção que só existe com dado) deixaria um buraco na
 * navegação lateral toda vez que o banco desse timeout, que é o normal do loader de SSG.
 */
export function comFrescorVivo(sections: Section[], linhas: FrescorDestino[]): Section[] {
  const rows = [...linhas]
    .sort((a, b) => (b.mudouEm ?? "").localeCompare(a.mudouEm ?? ""))
    .map((l) => ({ k: l.nome, v: linhaDeFrescor(l) }))
    .filter((r): r is { k: string; v: string } => r.v !== null);

  if (rows.length === 0) return sections;

  return sections.map((s) =>
    s.id === "frescor" ? { ...s, blocks: [...s.blocks, { type: "table" as const, rows }] } : s,
  );
}
