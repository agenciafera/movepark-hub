/**
 * Lógica pura da página /faq/<slug> (answer-first, padrão GEO).
 *
 * A palavra-chave de tráfego de aeroporto ("estacionamento aeroporto guarulhos")
 * precisa aparecer no title e no primeiro parágrafo de cada página. Estes
 * helpers derivam a forma de título e a forma de prosa a partir do destino do
 * banco, num lugar só e testável: mudar a regra aqui muda a página React e o
 * gêmeo Markdown juntos.
 */

export type FaqDestinoRef = {
  name: string;
  short_name: string | null;
  slug: string;
  code: string;
};

/** "Guarulhos (GRU)" vira "Guarulhos": o código IATA sai do nome curto. */
export function shortSemCodigo(shortName: string | null | undefined, name: string): string {
  const base = shortName ?? name;
  return base.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * A palavra-chave como a busca digita: "Estacionamento Aeroporto Guarulhos".
 * Destino que não é aeroporto (Tietê, Centro SP) cai em "Estacionamento <nome>".
 */
export function keywordDoTitulo(dest: FaqDestinoRef | null | undefined): string {
  if (!dest) return "Estacionamento de Aeroporto";
  const curto = shortSemCodigo(dest.short_name, dest.name);
  return dest.name.startsWith("Aeroporto")
    ? `Estacionamento Aeroporto ${curto}`
    : `Estacionamento ${curto}`;
}

/**
 * O aeroporto em prosa: o nome oficial quando é curto ("Aeroporto de Congonhas",
 * "Aeroporto Santos Dumont"); quando o oficial é longo demais pra correr no meio
 * da frase ("Aeroporto Internacional de São Paulo..."), usa a forma corrente
 * "Aeroporto de <curto>".
 */
export function aeroportoEmProsa(dest: FaqDestinoRef): string {
  if (dest.name.startsWith("Aeroporto") && dest.name.length <= 28) return dest.name;
  return `Aeroporto de ${shortSemCodigo(dest.short_name, dest.name)}`;
}

/**
 * O que a intro promete que vem depois da resposta rápida. Tem que bater com o
 * que a página de fato renderiza: "precos" quando a seção de preço do motor
 * existe (pergunta de preço em aeroporto com parceiro), "comparativo" quando a
 * pergunta de preço é de aeroporto sem parceiro (só a tabela pesquisada), e
 * "detalhes" pra qualquer outra pergunta (o corpo específico do tema).
 */
export type FechoDaIntro = "precos" | "comparativo" | "detalhes";

/** Primeiro parágrafo da página: é onde a palavra-chave aparece em texto corrido. */
export function introDaPergunta(
  dest: FaqDestinoRef | null | undefined,
  fecho: FechoDaIntro,
): string {
  if (dest) {
    const fechos: Record<FechoDaIntro, string> = {
      precos: "preços e o passo a passo estão logo abaixo",
      comparativo: "o comparativo da região está logo abaixo",
      detalhes: "os detalhes estão logo abaixo",
    };
    return `Pergunta comum de quem procura estacionamento no ${aeroportoEmProsa(dest)} (${dest.code}). A resposta curta vem primeiro; ${fechos[fecho]}.`;
  }
  return "Pergunta comum de quem procura estacionamento de aeroporto com reserva online. A resposta curta vem primeiro; os detalhes estão logo abaixo.";
}

// ---------------------------------------------------------------------------
// Contexto de preço do destino (vem do índice de preços no loader, compacto:
// o índice inteiro não pode viajar serializado no HTML de cada página).
// ---------------------------------------------------------------------------

export type FaqPrecoDestino = {
  slug: string;
  unitCount: number;
  partnerCount: number;
  byDuration: { days: number; from: number; fromPerDay: number }[];
};

export type FaqPrecoRede = {
  destinationCount: number;
  unitCount: number;
  minDailyFrom: number | null;
};

export type FaqPrecoContexto =
  | { kind: "destino"; destino: FaqPrecoDestino }
  | { kind: "rede"; rede: FaqPrecoRede }
  | null;
