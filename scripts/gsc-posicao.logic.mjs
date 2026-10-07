/**
 * Lógica pura do monitoramento de posição (Conteúdo 62): a lista de termos, o casamento com o
 * que o Search Console devolve, a agregação por dispositivo e a contagem do top 10. Não toca em
 * disco nem na rede; o I/O mora em `scripts/gsc-posicao.mjs`.
 *
 * Por que no Search Console e não no Semrush: a conta do Semrush é do plano gratuito (decisão de
 * 05/10/2026), e o Position Tracking dele não passa de 10 termos. A meta da seção 6 de
 * `plano-autoridade-backlinks.md` conta 60. Contexto em docs/specs/monitoramento-posicao.md.
 */

import { normalizar, posicaoPonderada } from "./gsc-baseline.logic.mjs";

/** Grupos na ordem do relatório. Só os de `meta: true` entram na conta "X de 60 no top 10". */
export const GRUPOS = [
  { id: "GRU", nome: "Guarulhos (GRU)", meta: true },
  { id: "VCP", nome: "Viracopos (VCP)", meta: true },
  { id: "CNF", nome: "Confins (CNF)", meta: true },
  { id: "CWB", nome: "Afonso Pena (CWB)", meta: true },
  // Congonhas fica fora da compra de link (seção 7 da spec de backlinks): é o controle que mostra
  // o que conteúdo e sazonalidade fazem sozinhos. Por isso é medida, mas não conta na meta.
  { id: "CGH", nome: "Congonhas (CGH), controle", meta: false },
  // Marca de parceiro mede a ficha do parceiro, não o plano. Fica separada para não inflar a meta.
  { id: "MARCA", nome: "Marca de parceiro", meta: false },
];

/**
 * De onde o termo veio. `placar` são as 12 consultas fixas do placar de citação em IA, com o
 * texto exato da planilha; `ataque-cnf` são as cabeças de Confins da spec do Ataque CNF;
 * `cabeca` são os termos de maior impressão de cada cluster no baseline do GSC.
 */
const t = (grupo, cluster, origem, termo) => ({ grupo, cluster, origem, termo });

export const TERMOS = [
  // Guarulhos
  t("GRU", "preco", "placar", "estacionamento aeroporto guarulhos preço"),
  t("GRU", "barato", "placar", "qual o estacionamento mais barato no aeroporto de guarulhos"),
  t("GRU", "proximidade", "placar", "estacionamento mais próximo do aeroporto de guarulhos"),
  t("GRU", "cabeca", "cabeca", "estacionamento aeroporto guarulhos"),
  t("GRU", "cabeca", "cabeca", "estacionamento guarulhos"),
  t("GRU", "proximidade", "cabeca", "estacionamento próximo aeroporto guarulhos"),
  t("GRU", "proximidade", "cabeca", "estacionamento próximo ao aeroporto de guarulhos"),
  t("GRU", "proximidade", "cabeca", "estacionamento perto do aeroporto de guarulhos"),
  t("GRU", "barato", "cabeca", "estacionamento aeroporto guarulhos barato"),
  t("GRU", "barato", "cabeca", "estacionamento aeroporto guarulhos mais barato"),
  t("GRU", "barato", "cabeca", "estacionamento barato guarulhos"),
  t("GRU", "preco", "cabeca", "diaria estacionamento guarulhos"),
  t("GRU", "preco", "cabeca", "diaria aeroporto guarulhos"),
  t("GRU", "preco", "cabeca", "preço estacionamento guarulhos"),
  t("GRU", "preco", "cabeca", "valor estacionamento no aeroporto de guarulhos"),

  // Viracopos
  t("VCP", "preco", "placar", "quanto custa estacionar em viracopos"),
  t("VCP", "barato", "placar", "qual o estacionamento mais barato em viracopos"),
  t("VCP", "proximidade", "placar", "estacionamento mais próximo de viracopos"),
  t("VCP", "cabeca", "cabeca", "estacionamento viracopos"),
  t("VCP", "cabeca", "cabeca", "estacionamento aeroporto viracopos"),
  t("VCP", "proximidade", "cabeca", "estacionamento perto de viracopos"),
  t("VCP", "proximidade", "cabeca", "estacionamento próximo aeroporto viracopos"),
  t("VCP", "proximidade", "cabeca", "estacionamento dentro do aeroporto viracopos"),
  t("VCP", "proximidade", "cabeca", "estacionamento perto do aeroporto de campinas"),
  t("VCP", "barato", "cabeca", "estacionamento viracopos barato"),
  t("VCP", "barato", "cabeca", "estacionamento viracopos mais barato"),
  t("VCP", "preco", "cabeca", "estacionamento viracopos preço"),
  t("VCP", "preco", "cabeca", "valor estacionamento aeroporto viracopos"),
  t("VCP", "preco", "cabeca", "diaria estacionamento viracopos"),

  // Confins
  t("CNF", "preco", "placar", "quanto custa estacionar em confins"),
  t("CNF", "barato", "placar", "qual o estacionamento mais barato em confins"),
  t("CNF", "proximidade", "placar", "estacionamento mais próximo do aeroporto de confins"),
  t("CNF", "preco", "ataque-cnf", "estacionamento aeroporto confins preço"),
  t("CNF", "melhor", "ataque-cnf", "melhor estacionamento aeroporto confins"),
  t("CNF", "desconto", "ataque-cnf", "estacionamento aeroporto confins desconto azul"),
  t("CNF", "cabeca", "ataque-cnf", "estacionamento aeroporto confins"),
  t("CNF", "preco", "ataque-cnf", "valor do estacionamento no aeroporto de confins"),
  t("CNF", "preco", "ataque-cnf", "diaria estacionamento aeroporto de confins"),
  t("CNF", "preco", "ataque-cnf", "qual o valor do estacionamento no aeroporto de confins"),
  t("CNF", "preco", "ataque-cnf", "quanto custa o estacionamento do aeroporto de confins"),
  t("CNF", "cabeca", "cabeca", "estacionamento confins"),
  t("CNF", "proximidade", "cabeca", "estacionamento dentro do aeroporto de confins"),
  t("CNF", "proximidade", "cabeca", "estacionamento perto do aeroporto de confins"),
  t("CNF", "barato", "cabeca", "estacionamento aeroporto confins mais barato"),
  t("CNF", "preco", "cabeca", "valor estacionamento aeroporto confins"),

  // Afonso Pena
  t("CWB", "preco", "placar", "quanto custa estacionar no aeroporto afonso pena"),
  t("CWB", "barato", "placar", "qual o estacionamento mais barato no afonso pena"),
  t("CWB", "proximidade", "placar", "estacionamento mais próximo do afonso pena"),
  t("CWB", "cabeca", "cabeca", "estacionamento aeroporto curitiba"),
  t("CWB", "cabeca", "cabeca", "estacionamento aeroporto afonso pena"),
  t("CWB", "proximidade", "cabeca", "estacionamento próximo aeroporto afonso pena"),
  t("CWB", "proximidade", "cabeca", "estacionamento próximo ao aeroporto curitiba"),
  t("CWB", "proximidade", "cabeca", "estacionamento perto do aeroporto de curitiba"),
  t("CWB", "barato", "cabeca", "estacionamento aeroporto curitiba barato"),
  t("CWB", "barato", "cabeca", "estacionamento mais barato aeroporto curitiba"),
  t("CWB", "preco", "cabeca", "valor estacionamento aeroporto curitiba"),
  t("CWB", "preco", "cabeca", "estacionamento aeroporto curitiba preço"),
  t("CWB", "preco", "cabeca", "preço estacionamento aeroporto afonso pena"),
  t("CWB", "preco", "cabeca", "diaria estacionamento aeroporto de curitiba"),

  // Congonhas (controle, fora da meta)
  t("CGH", "cabeca", "controle", "estacionamento aeroporto congonhas"),
  t("CGH", "proximidade", "controle", "estacionamento perto do aeroporto de congonhas"),
  t("CGH", "preco", "controle", "estacionamento congonhas preço"),

  // Marca de parceiro (fora da meta)
  t("MARCA", "marca", "marca", "virapark"),
  t("MARCA", "marca", "marca", "virapark campinas"),
  t("MARCA", "marca", "marca", "ponce park"),
  t("MARCA", "marca", "marca", "ponce park guarulhos"),
  t("MARCA", "marca", "marca", "urban park"),
  t("MARCA", "marca", "marca", "urbanpark"),
  t("MARCA", "marca", "marca", "estacionamento urban park guarulhos"),
  t("MARCA", "marca", "marca", "bepark"),
  t("MARCA", "marca", "marca", "be park confins"),
];

/** Dispositivos que viram coluna. Tablet entra no total, mas não ganha coluna própria. */
export const DISPOSITIVOS = [
  { id: "MOBILE", nome: "celular" },
  { id: "DESKTOP", nome: "computador" },
];

/** Posição a partir da qual o termo conta como "no top 10". */
export const TOP = 10;

/**
 * Impressões mínimas na janela para o termo valer como medido. Abaixo disso a posição é de uma
 * ou duas buscas: na primeira rodada, "estacionamento mais próximo do aeroporto de confins" tinha
 * 1 impressão na posição 10 e entraria na meta sem ninguém ter visto o site ali.
 */
export const MINIMO_DE_IMPRESSOES = 10;

/**
 * Janela de 28 dias terminando com o atraso de coleta já descontado. 28 e não 7: a maioria dos
 * termos tem dezenas de impressões por mês, e uma semana deixaria metade da lista sem dado.
 */
export function janelaDe28Dias(hoje, diasDeAtraso = 3) {
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  fim.setUTCDate(fim.getUTCDate() - diasDeAtraso);
  const inicio = new Date(fim);
  inicio.setUTCDate(inicio.getUTCDate() - 27);
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

/**
 * Agrega as linhas cruas `[query, device]` da API em uma linha por termo monitorado.
 *
 * O casamento é por igualdade depois de `normalizar`: "estacionamento próximo aeroporto
 * guarulhos" e "estacionamento proximo aeroporto guarulhos" são a mesma busca escrita com e sem
 * acento, e o Google mostra o mesmo resultado para as duas. Igualdade, não "contém": "contém"
 * puxaria a cauda longa para dentro do termo de cabeça e a posição deixaria de ser a dele.
 *
 * Termo sem impressão sai com posição `null`, nunca zero: significa que o site não apareceu para
 * ninguém naquela janela, o que na prática é fora das primeiras páginas.
 */
export function agregarTermos(linhas, termos = TERMOS) {
  const porChave = new Map();
  for (const linha of linhas) {
    const [consulta, dispositivo] = linha.keys;
    const chave = normalizar(consulta);
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave).push({ ...linha, dispositivo });
  }

  return termos.map((termo) => {
    const casadas = porChave.get(normalizar(termo.termo)) ?? [];
    const resumo = (filtradas) => ({
      impressoes: filtradas.reduce((s, l) => s + l.impressions, 0),
      cliques: filtradas.reduce((s, l) => s + l.clicks, 0),
      posicao: posicaoPonderada(filtradas),
    });
    const porDispositivo = Object.fromEntries(
      DISPOSITIVOS.map((d) => [d.id, resumo(casadas.filter((l) => l.dispositivo === d.id))]),
    );
    return { ...termo, total: resumo(casadas), porDispositivo };
  });
}

/** O termo tem impressão suficiente para a posição significar alguma coisa. */
export function medido(linha) {
  return linha.total.impressoes >= MINIMO_DE_IMPRESSOES;
}

/** No top 10: medido e com posição média de todos os dispositivos até 10. */
export function noTop(linha) {
  return medido(linha) && linha.total.posicao <= TOP;
}

/**
 * Placar de cada grupo e o da meta. `semDado` (menos de `MINIMO_DE_IMPRESSOES`) é separado de
 * "fora do top" de propósito: termo sem dado pode ser termo que o Search Console não enxerga, e
 * a revisão precisa saber disso em vez de ler como derrota.
 */
export function placar(linhas) {
  const conta = (doGrupo) => ({
    termos: doGrupo.length,
    noTop: doGrupo.filter(noTop).length,
    semDado: doGrupo.filter((l) => !medido(l)).length,
  });
  const grupos = GRUPOS.map((g) => ({ ...g, ...conta(linhas.filter((l) => l.grupo === g.id)) }));
  const daMeta = new Set(GRUPOS.filter((g) => g.meta).map((g) => g.id));
  return { grupos, meta: conta(linhas.filter((l) => daMeta.has(l.grupo))) };
}

/**
 * Delta de posição contra a rodada anterior, como `antes - depois`: positivo quer dizer que
 * subiu, a mesma convenção do `gsc-comparar`. Vazio quando falta posição em uma das pontas.
 */
export function deltaDePosicao(anterior, atual) {
  if (anterior === null || anterior === undefined || atual === null || atual === undefined) {
    return null;
  }
  return anterior - atual;
}

/** Termos repetidos depois de normalizar: dois itens que o Google trata como a mesma busca. */
export function termosDuplicados(termos = TERMOS) {
  const vistos = new Map();
  for (const item of termos) {
    const chave = normalizar(item.termo);
    vistos.set(chave, (vistos.get(chave) ?? 0) + 1);
  }
  return [...vistos].filter(([, n]) => n > 1).map(([chave]) => chave);
}
