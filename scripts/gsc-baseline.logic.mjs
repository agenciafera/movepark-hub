/**
 * Lógica pura do baseline do Search Console: janela de 16 meses, classificação de consulta
 * por aeroporto e por cluster de cabeça, agregação e serialização em CSV. Não toca em disco
 * nem na rede, para o teste (`src/lib/gscBaseline.test.ts`) rodar sem credencial nem fixture.
 * O I/O (autenticação, paginação da API, escrita dos arquivos) mora em `scripts/gsc-baseline.mjs`.
 *
 * Contexto em docs/specs/baseline-search-console.md.
 */

/** Os quatro aeroportos da onda 1 do plano de conteúdo, na ordem em que saem no relatório. */
export const AEROPORTOS = [
  {
    code: "GRU",
    nome: "Guarulhos (GRU)",
    slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
    // "sp" e "sao paulo" ficam de fora de propósito: pegariam Congonhas junto.
    termos: ["guarulhos", "gru", "cumbica"],
  },
  {
    code: "VCP",
    nome: "Viracopos (VCP)",
    slug: "aeroporto-de-viracopos",
    termos: ["viracopos", "vcp", "campinas"],
  },
  {
    code: "CNF",
    nome: "Confins (CNF)",
    slug: "aeroporto-de-confins",
    termos: ["confins", "cnf", "tancredo neves", "belo horizonte", "lagoa santa"],
  },
  {
    code: "CWB",
    nome: "Afonso Pena (CWB)",
    slug: "aeroporto-afonso-pena",
    termos: ["afonso pena", "cwb", "curitiba", "sao jose dos pinhais"],
  },
];

/**
 * Os três clusters de cabeça da Fase 1, na ordem de prioridade em que uma consulta ambígua
 * é atribuída. "barato" vem antes de "preco" porque é a intenção mais específica das duas:
 * quem busca "estacionamento barato gru" já decidiu o critério, quem busca "preço" ainda pesquisa.
 * A consulta guarda todos os clusters em que bateu, então a ambiguidade fica auditável.
 */
export const CLUSTERS = [
  {
    id: "proximidade",
    nome: "proximidade, perto",
    termos: ["perto", "proximo", "proxima", "proximidade", "dentro", "ao lado", "vizinho", "distancia", "em frente", "colado"],
  },
  {
    id: "barato",
    nome: "barato, economia, desconto",
    termos: ["barato", "barata", "economia", "economizar", "economico", "desconto", "cupom", "promocao", "em conta", "custo beneficio"],
  },
  {
    id: "preco",
    nome: "preço, valor, diária",
    termos: ["preco", "precos", "valor", "valores", "diaria", "diarias", "tarifa", "quanto custa", "quanto fica", "custo", "tabela"],
  },
];

/**
 * Minúscula sem acento e com espaço normalizado. A consulta chega do Search Console como o
 * usuário digitou, então "preço", "PREÇO" e "preco" têm que cair no mesmo balde.
 */
export function normalizar(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Casa o termo respeitando a fronteira de palavra, para "gru" não casar dentro de "grupo". */
function contemTermo(textoNormalizado, termo) {
  const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`).test(textoNormalizado);
}

/** Código do aeroporto da onda 1 que a consulta menciona, ou `null` se não menciona nenhum. */
export function aeroportoDaConsulta(consulta) {
  const texto = normalizar(consulta);
  const achado = AEROPORTOS.find((a) => a.termos.some((t) => contemTermo(texto, t)));
  return achado ? achado.code : null;
}

/**
 * Aeroporto de uma URL do site. Casa pelo slug do destino e, no acervo do blog, pelos mesmos
 * termos da consulta, porque o slug do post herdado do WordPress não segue o slug do destino.
 */
export function aeroportoDaUrl(url) {
  const texto = normalizar(decodeURIComponent(String(url ?? "")).replace(/[/_-]+/g, " "));
  const porSlug = AEROPORTOS.find((a) => texto.includes(normalizar(a.slug.replace(/-/g, " "))));
  if (porSlug) return porSlug.code;
  const porTermo = AEROPORTOS.find((a) => a.termos.some((t) => contemTermo(texto, t)));
  return porTermo ? porTermo.code : null;
}

/**
 * Clusters em que a consulta bate. Devolve `{ principal, todos }`: o principal é o primeiro
 * na ordem de prioridade de `CLUSTERS` e é ele que soma no total, para nenhum clique ser
 * contado duas vezes; `todos` preserva a sobreposição para revisão manual.
 */
export function clustersDaConsulta(consulta) {
  const texto = normalizar(consulta);
  const todos = CLUSTERS.filter((c) => c.termos.some((t) => contemTermo(texto, t))).map((c) => c.id);
  return { principal: todos[0] ?? null, todos };
}

/** Janela de 16 meses do Search Console, com o atraso de coleta já descontado do fim. */
export function janelaDe16Meses(hoje, diasDeAtraso = 3) {
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  fim.setUTCDate(fim.getUTCDate() - diasDeAtraso);
  const inicio = new Date(fim);
  inicio.setUTCMonth(inicio.getUTCMonth() - 16);
  inicio.setUTCDate(inicio.getUTCDate() + 1);
  return { inicio: emIso(inicio), fim: emIso(fim) };
}

function emIso(data) {
  return data.toISOString().slice(0, 10);
}

/**
 * Média de posição ponderada por impressão. A posição que a API devolve já é uma média por
 * linha, então somar e dividir pela contagem de linhas daria peso igual a um termo com 3
 * impressões e a um com 30 mil. Sem impressão nenhuma devolve `null`, não zero: posição zero
 * não existe e viraria "primeiro lugar" em qualquer leitura posterior.
 */
export function posicaoPonderada(linhas) {
  const impressoes = linhas.reduce((soma, l) => soma + (l.impressions ?? 0), 0);
  if (impressoes === 0) return null;
  const produto = linhas.reduce((soma, l) => soma + (l.position ?? 0) * (l.impressions ?? 0), 0);
  return produto / impressoes;
}

/**
 * Recorte dos 3 clusters de cabeça nos 4 aeroportos da onda 1.
 *
 * Recebe as linhas cruas da dimensão `query` e devolve uma célula por par aeroporto x cluster,
 * sempre as 12, mesmo as vazias: célula ausente some do relatório e some da comparação de 90
 * dias, que é exatamente o que este baseline existe para permitir.
 */
export function recorteDeClusters(linhasDeConsulta) {
  const classificadas = classificarConsultas(linhasDeConsulta);
  return AEROPORTOS.flatMap((aeroporto) =>
    CLUSTERS.map((cluster) => {
      const daCelula = classificadas.filter(
        (l) => l.aeroporto === aeroporto.code && l.cluster === cluster.id,
      );
      return {
        aeroporto: aeroporto.code,
        cluster: cluster.id,
        consultas: daCelula.length,
        cliques: daCelula.reduce((s, l) => s + l.clicks, 0),
        impressoes: daCelula.reduce((s, l) => s + l.impressions, 0),
        posicao: posicaoPonderada(daCelula),
        topConsultas: [...daCelula].sort((a, b) => b.impressions - a.impressions).slice(0, 10),
      };
    }),
  );
}

/** Anota cada linha de consulta com aeroporto e cluster, descartando o que não é da onda 1. */
export function classificarConsultas(linhasDeConsulta) {
  return linhasDeConsulta
    .map((linha) => {
      const consulta = linha.keys?.[0] ?? linha.consulta ?? "";
      const { principal, todos } = clustersDaConsulta(consulta);
      return {
        consulta,
        aeroporto: aeroportoDaConsulta(consulta),
        cluster: principal,
        clusters: todos,
        clicks: linha.clicks ?? 0,
        impressions: linha.impressions ?? 0,
        ctr: linha.ctr ?? 0,
        position: linha.position ?? 0,
      };
    })
    .filter((l) => l.aeroporto !== null && l.cluster !== null);
}

/** Serializa em CSV com aspas em tudo, porque consulta de busca vem com vírgula e com aspas. */
export function paraCsv(colunas, linhas) {
  const celula = (valor) => `"${String(valor ?? "").replace(/"/g, '""')}"`;
  const cabecalho = colunas.map((c) => celula(c.titulo)).join(",");
  const corpo = linhas.map((linha) => colunas.map((c) => celula(c.valor(linha))).join(","));
  return [cabecalho, ...corpo].join("\n") + "\n";
}

/** Número com casas fixas, ou vazio quando não há valor. Evita "null" impresso no CSV. */
export function numero(valor, casas = 2) {
  return valor === null || valor === undefined || Number.isNaN(valor) ? "" : valor.toFixed(casas);
}

/**
 * Número em pt-BR, para o resumo em markdown. Só o resumo: o CSV fica com ponto decimal e sem
 * separador de milhar, porque quem abre CSV é planilha e script, não gente.
 */
export function emPtBr(valor, casas = 0) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/**
 * Neutraliza o pipe dentro de célula de tabela markdown. Consulta de busca e URL trazem pipe, e
 * um pipe cru desloca todas as colunas da linha para a direita.
 */
export function escaparPipe(texto) {
  return String(texto ?? "").replace(/\|/g, "\\|");
}

/** Ordena chave de objeto em profundidade, para a comparação não depender da ordem de escrita. */
function canonico(valor) {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.keys(valor)
        .sort()
        .map((chave) => [chave, canonico(valor[chave])]),
    );
  }
  return valor;
}

/**
 * Preserva o `geradoEm` anterior quando a re-rodada devolve exatamente os mesmos números.
 *
 * Sem isto, rodar o coletor de novo sujava o `git status` com uma diferença de uma linha que
 * não é dado novo, só relógio, e é assim que ruído entra de carona num commit alheio. O repo
 * já tratou a mesma doença no manifesto do blog (`af493c84`).
 *
 * A semântica também fica mais honesta: `geradoEm` passa a significar quando o baseline foi
 * congelado, e re-rodada que não muda número nenhum não congelou nada de novo. Se o Google
 * revisar os dados, aí o carimbo anda, porque aí é outro baseline.
 */
export function metaComCarimboEstavel(metaNovo, metaAnterior) {
  if (!metaAnterior?.geradoEm) return metaNovo;
  const { geradoEm: _ignorado, ...restoNovo } = metaNovo;
  const { geradoEm: carimboAnterior, ...restoAnterior } = metaAnterior;
  const igual = JSON.stringify(canonico(restoNovo)) === JSON.stringify(canonico(restoAnterior));
  return igual ? { ...metaNovo, geradoEm: carimboAnterior } : metaNovo;
}
