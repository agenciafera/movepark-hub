#!/usr/bin/env node
/**
 * Analisador de blogpost do Movepark, no padrão de análise do Yoast.
 *
 * Por que existe: "otimizei o SEO" é uma frase, não um fato. O Yoast virou o
 * padrão do mercado porque transforma a opinião em semáforo reproduzível, e é
 * exatamente isso que falta quando um post é escrito por um modelo: sem medida,
 * a densidade escapa, o link externo some e a contagem de palavras vira chute.
 * Este script mede o que dá para medir e falha alto no que quebra o projeto
 * (HTML cru, travessão, tarifa sem data, link para concorrente).
 *
 * Ele não substitui leitura humana: ortografia fina, veracidade e tom continuam
 * sendo trabalho de quem escreve. Ver ../references/yoast-criterios.md.
 *
 * Uso:
 *   node .claude/skills/blogpost-seo-geo/scripts/analisar-post.mjs <rascunho.md>
 *   node ... <rascunho.md> --json        # saída para máquina
 *   node ... <rascunho.md> --silencioso  # só o resumo e os problemas
 *
 * Entrada: markdown com front matter (ver ../references/yoast-criterios.md §1).
 * Saída: relatório por critério. Código de saída 1 se houver qualquer vermelho.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FONTES = JSON.parse(fs.readFileSync(path.join(AQUI, "fontes.json"), "utf8"));

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith("--"));
const flag = (n) => args.includes(`--${n}`);

if (!arquivo) {
  console.error("uso: analisar-post.mjs <rascunho.md> [--json] [--silencioso]");
  process.exit(2);
}

// ---------------------------------------------------------------- utilidades

const semAcento = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) =>
  semAcento(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Front matter em `chave: valor`, com lista em `chave: [a, b]`. */
function lerFrontMatter(bruto) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(bruto);
  if (!m) return { meta: {}, corpo: bruto };
  const meta = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const par = /^([a-z_]+):\s*(.*)$/i.exec(linha.trim());
    if (!par) continue;
    const v = par[2].trim();
    meta[par[1]] =
      v.startsWith("[") && v.endsWith("]")
        ? v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
        : v.replace(/^["']|["']$/g, "");
  }
  return { meta, corpo: bruto.slice(m[0].length) };
}

/** Markdown sem marcação, para contagem e leitura. O rótulo do link fica. */
function textoPuro(md) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*\|.*$/gm, (l) => l.replace(/\|/g, " "))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*|__|\*|_/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const contarPalavras = (t) =>
  t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const LIGACAO = "(?:de|da|do|das|dos|no|na|nos|nas|em|a|o|as|os|e|para|pra|ao|aos|um|uma)";

/**
 * Regex da frase-chave por palavra de conteúdo, tolerante a plural e a conectivo.
 *
 * As preposições e artigos da própria frase-chave são descartados, e entre as
 * palavras que sobram cabem até dois conectivos. É assim que "estacionamento no
 * aeroporto de Viracopos" casa "estacionamento do Aeroporto de Viracopos" e
 * "estacionamentos no aeroporto de Viracopos". Sem isso a medida acusaria zero
 * num texto que usa a frase o tempo todo, só que escrita como gente escreve.
 */
function regexFrase(frase) {
  const todas = norm(frase).split(" ").filter(Boolean);
  const conteudo = todas.filter((p) => !new RegExp(`^${LIGACAO}$`).test(p));
  const partes = (conteudo.length ? conteudo : todas).map((p) => {
    const escapada = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return p.length > 4 ? `${escapada.replace(/s$/, "")}s?` : escapada;
  });
  if (!partes.length) return null;
  return new RegExp(`\\b${partes.join(`(?:\\s+${LIGACAO}){0,2}\\s+`)}\\b`, "g");
}

const contarFrase = (textoNorm, frase) => {
  const re = regexFrase(frase);
  return re ? (textoNorm.match(re) || []).length : 0;
};

/**
 * Separa frases sem quebrar em "R$ 1.234,50" nem em "Sr.".
 * O separador de milhar some no processo, o que não afeta contagem nem leitura.
 */
function frases(texto) {
  return texto
    .replace(/(\d)[.,](\d)/g, "$1$2")
    .replace(/\b(Sr|Sra|Dr|Dra|Av|Prof|etc)\./gi, "$1")
    .split(/(?<=[.!?\u2026])\s+|\n{2,}/)
    .map((f) => f.trim())
    .filter((f) => contarPalavras(f) > 0);
}

/** Sílabas por grupo de vogais. Subconta ditongo, mas de forma consistente. */
function silabas(palavra) {
  const p = semAcento(palavra.toLowerCase()).replace(/[^a-z]/g, "");
  if (!p) return 0;
  return (p.match(/[aeiou]+/g) || [""]).length;
}

const pct = (n, d) => (d === 0 ? 0 : (n / d) * 100);
const f1 = (n) => n.toFixed(1).replace(".", ",");

// ------------------------------------------------------------------ critérios

const achados = [];
const add = (grupo, titulo, nivel, texto) => achados.push({ grupo, titulo, nivel, texto });
const verde = (g, t, txt) => add(g, t, "verde", txt);
const laranja = (g, t, txt) => add(g, t, "laranja", txt);
const vermelho = (g, t, txt) => add(g, t, "vermelho", txt);

const bruto = fs.readFileSync(arquivo, "utf8");
const { meta, corpo } = lerFrontMatter(bruto);

const puro = textoPuro(corpo);
const puroNorm = norm(puro);
const palavras = contarPalavras(puro);
const listaFrases = frases(puro);
const chave = meta.keyphrase || "";
const sinonimos = Array.isArray(meta.sinonimos) ? meta.sinonimos : [];

// --- 1. Estrutura da entrada -------------------------------------------------

const G_ENTRADA = "Entrada";
for (const campo of ["slug", "title", "meta_description", "keyphrase"]) {
  if (!meta[campo]) vermelho(G_ENTRADA, campo, `Front matter sem "${campo}". Sem ele a análise é cega.`);
}
if (meta.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.slug)) {
  vermelho(G_ENTRADA, "slug", `"${meta.slug}" não é kebab-case sem acento. O slug é o contrato de URL.`);
} else if (meta.slug) {
  verde(G_ENTRADA, "slug", `${meta.slug}`);
}

// --- 2. SEO ------------------------------------------------------------------

const G_SEO = "SEO";

// 2.1 densidade
if (chave) {
  const ocorrencias = contarFrase(puroNorm, chave);
  const densidade = pct(ocorrencias, palavras);
  const info = `${f1(densidade)}% (${ocorrencias} ocorrências em ${palavras} palavras)`;
  if (ocorrencias === 0) vermelho(G_SEO, "Densidade da frase-chave", `A frase-chave não aparece no corpo. ${info}`);
  else if (densidade > 3) vermelho(G_SEO, "Densidade da frase-chave", `Acima de 3%, o Google lê como keyword stuffing. ${info}`);
  else if (densidade < 0.5) laranja(G_SEO, "Densidade da frase-chave", `Abaixo de 0,5%. Distribua mais a frase-chave. ${info}`);
  else verde(G_SEO, "Densidade da frase-chave", info);

  const sinOc = sinonimos.reduce((t, s) => t + contarFrase(puroNorm, s), 0);
  if (!sinonimos.length) laranja(G_SEO, "Sinônimos", "Nenhum sinônimo declarado. Sem variação, o texto repete a mesma frase e soa artificial.");
  else if (sinOc === 0) laranja(G_SEO, "Sinônimos", `${sinonimos.length} declarados, nenhum usado no corpo.`);
  else verde(G_SEO, "Sinônimos", `${sinOc} ocorrências de ${sinonimos.length} variações.`);
}

// 2.2 primeira frase
const primeiroParagrafo =
  corpo.split(/\n{2,}/).map((b) => b.trim()).find((b) => b && !/^[#>|!\-*\d]/.test(b)) || "";
if (chave) {
  const primeiraFrase = frases(textoPuro(primeiroParagrafo))[0] || "";
  if (contarFrase(norm(primeiraFrase), chave) > 0)
    verde(G_SEO, "Frase-chave na primeira frase", "Aparece já na abertura.");
  else if (contarFrase(norm(textoPuro(primeiroParagrafo)), chave) > 0)
    laranja(G_SEO, "Frase-chave na primeira frase", "Está no primeiro parágrafo, mas não na primeira frase.");
  else vermelho(G_SEO, "Frase-chave na primeira frase", "Ausente do primeiro parágrafo.");
}

// 2.3 título e meta
if (chave && meta.title) {
  const t = norm(meta.title);
  const posicao = t.search(regexFrase(chave) || /$^/);
  if (posicao < 0) vermelho(G_SEO, "Frase-chave no título", "O H1 do post não contém a frase-chave.");
  else if (posicao > t.length / 2) laranja(G_SEO, "Frase-chave no título", "Aparece na segunda metade. Puxe para o começo.");
  else verde(G_SEO, "Frase-chave no título", "No começo do título.");
}
const tituloSeo = meta.meta_title || meta.title || "";
if (tituloSeo) {
  const n = tituloSeo.length;
  if (n < 30) laranja(G_SEO, "Tamanho do título de SERP", `${n} caracteres. Curto, sobra espaço no resultado.`);
  else if (n > 60) laranja(G_SEO, "Tamanho do título de SERP", `${n} caracteres. Acima de 60 o Google trunca.`);
  else verde(G_SEO, "Tamanho do título de SERP", `${n} caracteres.`);
}
if (meta.meta_description) {
  const n = meta.meta_description.length;
  if (n < 120) laranja(G_SEO, "Meta description", `${n} caracteres. Abaixo de 120 desperdiça o espaço da SERP.`);
  else if (n > 156) laranja(G_SEO, "Meta description", `${n} caracteres. Acima de 156 o Google corta.`);
  else verde(G_SEO, "Meta description", `${n} caracteres.`);
  if (chave && contarFrase(norm(meta.meta_description), chave) === 0)
    laranja(G_SEO, "Frase-chave na meta description", "Ausente. É ela que fica em negrito na SERP.");
  else if (chave) verde(G_SEO, "Frase-chave na meta description", "Presente.");
}
if (chave && meta.slug) {
  const alvo = norm(meta.slug.replace(/-/g, " "));
  if (contarFrase(alvo, chave) > 0) verde(G_SEO, "Frase-chave no slug", meta.slug);
  else vermelho(G_SEO, "Frase-chave no slug", `"${meta.slug}" não contém a frase-chave.`);
}

// 2.4 títulos internos
const titulos = [...corpo.matchAll(/^(#{1,6})\s+(.*)$/gm)].map((m) => ({
  nivel: m[1].length,
  texto: m[2].trim(),
}));
const h2h3 = titulos.filter((t) => t.nivel === 2 || t.nivel === 3);
if (chave && h2h3.length) {
  const comChave = h2h3.filter(
    (t) => contarFrase(norm(t.texto), chave) > 0 || sinonimos.some((s) => contarFrase(norm(t.texto), s) > 0),
  ).length;
  const p = pct(comChave, h2h3.length);
  const info = `${comChave} de ${h2h3.length} títulos (${f1(p)}%)`;
  if (comChave === 0) vermelho(G_SEO, "Frase-chave nos títulos", `Nenhum H2/H3 com a frase-chave. ${info}`);
  else if (p > 75) laranja(G_SEO, "Frase-chave nos títulos", `Acima de 75% soa repetitivo. ${info}`);
  else if (p < 30) laranja(G_SEO, "Frase-chave nos títulos", `Abaixo de 30%. ${info}`);
  else verde(G_SEO, "Frase-chave nos títulos", info);
}
if (!h2h3.length) vermelho(G_SEO, "Títulos internos", "O post não tem nenhum H2. Sem outline não há trecho citável.");

// 2.5 contagem de palavras
if (palavras < 3000)
  vermelho(G_SEO, "Contagem de palavras", `${palavras} palavras. O mínimo do projeto é 3.000.`);
else verde(G_SEO, "Contagem de palavras", `${palavras} palavras.`);

// 2.6 imagens e alt
const imagens = [...corpo.matchAll(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)].map((m) => ({
  alt: m[1].trim(),
  src: m[2],
}));
const todasImagens = meta.cover_image_url
  ? [{ alt: (meta.cover_alt || "").trim(), src: meta.cover_image_url, capa: true }, ...imagens]
  : imagens;
if (!todasImagens.length) {
  vermelho(G_SEO, "Imagens", "Nenhuma imagem, nem capa. Sem capa o card do índice fica sem nome.");
} else {
  const semAlt = todasImagens.filter((i) => !i.alt);
  const comChave = chave ? todasImagens.filter((i) => contarFrase(norm(i.alt), chave) > 0).length : 0;
  if (semAlt.length) vermelho(G_SEO, "Alt das imagens", `${semAlt.length} de ${todasImagens.length} sem alt.`);
  else verde(G_SEO, "Alt das imagens", `${todasImagens.length} imagens, todas com alt.`);
  if (chave && comChave === 0)
    vermelho(G_SEO, "Frase-chave no alt", "Nenhum alt contém a frase-chave.");
  else if (chave && comChave === todasImagens.length && todasImagens.length > 2)
    laranja(G_SEO, "Frase-chave no alt", "Todos os alts repetem a frase-chave. Descreva a imagem, varie.");
  else if (chave) verde(G_SEO, "Frase-chave no alt", `${comChave} de ${todasImagens.length}.`);
}

// 2.7 links
const links = [...corpo.matchAll(/(?<!!)\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)].map((m) => ({
  rotulo: m[1].replace(/[*_]/g, "").trim(),
  href: m[2],
}));
const PROPRIO = /(^|\.)movepark\.co$/i;
const hostDe = (href) => {
  try {
    return new URL(href).hostname.toLowerCase();
  } catch {
    return null;
  }
};
const internos = links.filter((l) => l.href.startsWith("/") || PROPRIO.test(hostDe(l.href) || ""));
const externos = links.filter((l) => !internos.includes(l) && /^https?:/i.test(l.href));

if (!internos.length) vermelho(G_SEO, "Link interno", "Nenhum link interno. O post não leva a lugar nenhum do site.");
else {
  const paraDestino = internos.filter((l) => /\/destinos\//.test(l.href)).length;
  const paraPost = internos.filter((l) => /\/blog\//.test(l.href)).length;
  if (!paraDestino)
    vermelho(G_SEO, "Link para o destino", "Nenhum link para /destinos/<slug>. É a página que converte e onde mora o preço vivo.");
  else verde(G_SEO, "Link para o destino", `${paraDestino} link(s) para /destinos/.`);
  if (!paraPost) laranja(G_SEO, "Link interno para post", "Nenhum link para outro post. O acervo tem 93, use dois ou três relacionados.");
  else verde(G_SEO, "Link interno", `${internos.length} internos, ${paraPost} para outros posts.`);
}

const bloqueados = [];
const semContexto = [];
for (const l of externos) {
  const host = hostDe(l.href) || "";
  const caminho = (() => {
    try {
      return new URL(l.href).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const raiz = host.replace(/^www\./, "");
  const ehOperador = FONTES.operadores_aeroporto.some((d) => raiz === d || raiz.endsWith(`.${d}`));
  if (FONTES.bloqueadas.some((d) => raiz === d || raiz.endsWith(`.${d}`)))
    bloqueados.push(`${raiz} (concorrente conhecido)`);
  else if (!ehOperador && FONTES.padroes_bloqueados.some((p) => raiz.includes(p)))
    bloqueados.push(`${raiz} (domínio com cara de estacionamento)`);
  else if (ehOperador && /estacion|parking|park/.test(caminho))
    bloqueados.push(`${raiz}${caminho} (página de estacionamento do próprio aeroporto)`);
  if (!l.rotulo || /^(clique aqui|aqui|saiba mais|leia mais|link|veja)$/i.test(l.rotulo) || /^https?:/i.test(l.rotulo))
    semContexto.push(l.href);
}
if (!externos.length)
  vermelho(G_SEO, "Link externo", "Nenhum link externo. Fonte externa é sinal de confiança para o Google e para a IA.");
else if (bloqueados.length)
  vermelho(G_SEO, "Link externo", `Concorrente direto no link: ${bloqueados.join("; ")}.`);
else if (semContexto.length)
  laranja(G_SEO, "Link externo", `Rótulo sem contexto em: ${semContexto.join(", ")}.`);
else {
  const confiaveis = externos.filter((l) => {
    const raiz = (hostDe(l.href) || "").replace(/^www\./, "");
    return FONTES.confiaveis.some((d) => raiz === d || raiz.endsWith(`.${d}`));
  }).length;
  verde(G_SEO, "Link externo", `${externos.length} externos, ${confiaveis} de fonte reconhecida.`);
}

// 2.8 distribuição da frase-chave
if (chave && palavras > 600) {
  const tokens = puroNorm.split(" ");
  const janela = 600;
  const lacunas = [];
  for (let i = 0; i < tokens.length; i += janela) {
    const trecho = tokens.slice(i, i + janela).join(" ");
    const tem =
      contarFrase(trecho, chave) > 0 || sinonimos.some((s) => contarFrase(trecho, s) > 0);
    if (!tem) lacunas.push(`palavras ${i + 1}-${Math.min(i + janela, tokens.length)}`);
  }
  if (lacunas.length > 1)
    laranja(G_SEO, "Distribuição da frase-chave", `Trechos longos sem a frase nem sinônimo: ${lacunas.join(", ")}.`);
  else verde(G_SEO, "Distribuição da frase-chave", "A frase-chave e os sinônimos cobrem o texto inteiro.");
}

// --- 3. Sintaxe e render -----------------------------------------------------

const G_SINTAXE = "Sintaxe e render";
const tagsHtml = [...corpo.matchAll(/<\/?[a-zA-Z][^>\n]*>/g)].map((m) => m[0]);
const comentarios = /<!--/.test(corpo);
const entidades = [...corpo.matchAll(/&(nbsp|amp|lt|gt|quot|#\d+);/g)].map((m) => m[0]);
if (tagsHtml.length || comentarios)
  vermelho(
    G_SINTAXE,
    "HTML cru",
    `${tagsHtml.length} tag(s) no corpo${comentarios ? " mais comentário HTML" : ""}: ${[...new Set(tagsHtml)].slice(0, 6).join(" ")}. O render do post não interpreta HTML, ele imprime na tela.`,
  );
else verde(G_SINTAXE, "HTML cru", "Nenhuma tag no corpo.");
if (entidades.length)
  vermelho(G_SINTAXE, "Entidade HTML", `${[...new Set(entidades)].join(" ")} aparecem literais na tela.`);
if (/```|~~~/.test(corpo))
  vermelho(G_SINTAXE, "Bloco de código", "O render não tem bloco de código. As crases aparecem na tela.");
if (/`[^`\n]+`/.test(corpo))
  laranja(G_SINTAXE, "Código inline", "Crase simples não é suportada, sai literal.");
if (/~~[^~]+~~/.test(corpo)) laranja(G_SINTAXE, "Texto riscado", "`~~` não é suportado, sai literal.");

const foraDoNivel = titulos.filter((t) => t.nivel === 1 || t.nivel > 4);
if (foraDoNivel.length)
  vermelho(
    G_SINTAXE,
    "Nível de título",
    `Use só ## ### ####. O H1 é o title do post. Fora do intervalo: ${foraDoNivel.map((t) => "#".repeat(t.nivel)).join(" ")}.`,
  );
else if (titulos.length) verde(G_SINTAXE, "Nível de título", `${titulos.length} títulos, todos entre H2 e H4.`);

let anterior = 1;
const saltos = [];
for (const t of titulos) {
  if (t.nivel > anterior + 1) saltos.push(t.texto.slice(0, 40));
  anterior = t.nivel;
}
if (saltos.length) laranja(G_SINTAXE, "Hierarquia de títulos", `Salto de nível em: ${saltos.join("; ")}.`);

if (/^\s{4,}[-*]\s/m.test(corpo))
  laranja(G_SINTAXE, "Sublista", "O render aceita um nível de sublista. Mais fundo que isso é achatado.");

const linksQuebrados = links.filter((l) => !/^(https?:\/\/|\/|#|mailto:)/i.test(l.href));
if (linksQuebrados.length)
  vermelho(G_SINTAXE, "Link malformado", `Destino inválido em: ${linksQuebrados.map((l) => l.href).join(", ")}.`);

const travessoes = (corpo.match(/[—–]/g) || []).length;
if (travessoes)
  vermelho(G_SINTAXE, "Travessão", `${travessoes} ocorrência(s) de travessão ou traço. O CLAUDE.md proíbe os dois no projeto inteiro.`);
else verde(G_SINTAXE, "Travessão", "Nenhum.");

const duplicadas = [...puro.matchAll(/\b(\w{3,})\s+\1\b/gi)].map((m) => m[1]);
if (duplicadas.length)
  laranja(G_SINTAXE, "Palavra repetida", `Repetição colada: ${[...new Set(duplicadas)].slice(0, 8).join(", ")}.`);
// Só espaço horizontal: `\s` pegaria a quebra de linha antes do `!` de imagem.
if (/[ \t]+[,.;:!?]/.test(corpo)) laranja(G_SINTAXE, "Pontuação", "Espaço antes de pontuação.");
if (/ {2,}\S/.test(corpo.replace(/^ +/gm, ""))) laranja(G_SINTAXE, "Espaçamento", "Espaço duplo no meio da frase.");

// --- 4. Tabela e preço (ADR-009) --------------------------------------------

const G_PRECO = "Preço e ADR-009";
const linhasTabela = (corpo.match(/^\s*\|.*\|\s*$/gm) || []).length;
const tabelas = linhasTabela ? (corpo.match(/(?:^\s*\|.*\|\s*$\n)+/gm) || []).length : 0;
const falaDePreco = /R\$|pre[çc]o|tarifa|di[áa]ria|quanto custa|valor/i.test(puro);
const MESES = "janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
const temData = new RegExp(`(atualizad[oa] em|consultad[oa] em|em (${MESES})|/20\\d\\d|\\b20\\d\\d\\b)`, "i").test(puro);

if (tabelas) verde(G_PRECO, "Tabela", `${tabelas} tabela(s), ${linhasTabela} linhas.`);
else if (falaDePreco)
  vermelho(G_PRECO, "Tabela", "O post fala de preço em prosa e não tem tabela. Comparativo de preço é tabela.");
else laranja(G_PRECO, "Tabela", "Nenhuma tabela. Sempre que houver dado comparável, use uma.");

if (/R\$/.test(puro)) {
  if (!temData)
    vermelho(
      G_PRECO,
      "Data do preço",
      "Há valor em R$ sem data de referência. Sem data a tarifa vira promessa que o código não consegue retirar (ADR-009).",
    );
  else verde(G_PRECO, "Data do preço", "Os valores estão datados.");
  if (!internos.some((l) => /\/destinos\//.test(l.href)))
    vermelho(G_PRECO, "Preço vivo", "Valor no corpo sem link para /destinos/, onde o preço é o de verdade.");
}
const promessa =
  /(vaga garantida|garantimos|cancelamento gr[áa]tis|cancele quando quiser|reembolso garantido|pre[çc]o fixo)/i.exec(
    puro,
  );
if (promessa)
  vermelho(
    G_PRECO,
    "Promessa de transação",
    `"${promessa[0]}" no corpo do post. ADR-009: promessa só renderiza onde a capacidade é declarada, e post não declara capacidade.`,
  );

// --- 5. Legibilidade ---------------------------------------------------------

const G_LEITURA = "Legibilidade";
const totalFrases = listaFrases.length || 1;
const longas = listaFrases.filter((f) => contarPalavras(f) > 20).length;
const pLongas = pct(longas, totalFrases);
if (pLongas > 25) laranja(G_LEITURA, "Frases longas", `${f1(pLongas)}% acima de 20 palavras. O teto do Yoast é 25%.`);
else verde(G_LEITURA, "Frases longas", `${f1(pLongas)}% acima de 20 palavras.`);

const paragrafos = corpo
  .split(/\n{2,}/)
  .map((b) => b.trim())
  .filter((b) => b && !/^[#>|]/.test(b) && !/^!\[/.test(b));
const parLongos = paragrafos.filter((p) => contarPalavras(textoPuro(p)) > 150).length;
if (parLongos) laranja(G_LEITURA, "Parágrafos longos", `${parLongos} acima de 150 palavras.`);
else verde(G_LEITURA, "Parágrafos longos", "Nenhum acima de 150 palavras.");

const blocos = corpo.split(/^#{2,4}\s+.*$/gm).map((b) => contarPalavras(textoPuro(b)));
const semSubtitulo = blocos.filter((n) => n > 300).length;
if (semSubtitulo)
  laranja(G_LEITURA, "Distribuição de subtítulos", `${semSubtitulo} trecho(s) com mais de 300 palavras sem subtítulo.`);
else verde(G_LEITURA, "Distribuição de subtítulos", "Nenhum trecho longo sem subtítulo.");

const PASSIVA = /\b(foi|foram|é|são|era|eram|será|serão|sendo|sido|ser|está|estão)\s+(?:\w+mente\s+)?\w+(ado|ada|ados|adas|ido|ida|idos|idas)\b/i;
const passivas = listaFrases.filter((f) => PASSIVA.test(f)).length;
const pPassiva = pct(passivas, totalFrases);
if (pPassiva > 10) laranja(G_LEITURA, "Voz passiva", `${f1(pPassiva)}% das frases. O teto do Yoast é 10%.`);
else verde(G_LEITURA, "Voz passiva", `${f1(pPassiva)}% das frases.`);

const TRANSICAO = [
  "além disso", "no entanto", "portanto", "por isso", "porque", "então", "assim", "ou seja",
  "por exemplo", "na prática", "enquanto", "embora", "apesar", "depois", "antes", "primeiro",
  "por fim", "em resumo", "isto é", "inclusive", "contudo", "entretanto", "já que", "logo",
  "também", "ainda", "quando", "se", "mas", "e ainda", "na verdade", "vale dizer", "por outro lado",
];
const comTransicao = listaFrases.filter((f) => {
  const n = ` ${norm(f)} `;
  return TRANSICAO.some((t) => n.includes(` ${norm(t)} `));
}).length;
const pTransicao = pct(comTransicao, totalFrases);
if (pTransicao < 30) laranja(G_LEITURA, "Palavras de transição", `${f1(pTransicao)}% das frases. O piso do Yoast é 30%.`);
else verde(G_LEITURA, "Palavras de transição", `${f1(pTransicao)}% das frases.`);

const inicios = listaFrases.map((f) => norm(f).split(" ")[0]);
let seguidas = 1;
const repetidos = [];
for (let i = 1; i < inicios.length; i++) {
  seguidas = inicios[i] === inicios[i - 1] ? seguidas + 1 : 1;
  if (seguidas === 3) repetidos.push(inicios[i]);
}
if (repetidos.length) laranja(G_LEITURA, "Início consecutivo", `Três frases seguidas começando com: ${[...new Set(repetidos)].join(", ")}.`);
else verde(G_LEITURA, "Início consecutivo", "Sem repetição de abertura.");

const totalSilabas = puro.split(/\s+/).reduce((t, p) => t + silabas(p), 0);
const flesch = 248.835 - 1.015 * (palavras / totalFrases) - 84.6 * (totalSilabas / (palavras || 1));
if (flesch < 40) laranja(G_LEITURA, "Facilidade de leitura", `Flesch pt-BR ${f1(flesch)}. Abaixo de 40 é difícil.`);
else verde(G_LEITURA, "Facilidade de leitura", `Flesch pt-BR ${f1(flesch)}.`);

// --- 6. GEO ------------------------------------------------------------------

const G_GEO = "GEO";
const aberturaPalavras = contarPalavras(textoPuro(primeiroParagrafo));
if (!primeiroParagrafo) vermelho(G_GEO, "Resposta direta", "O post não abre com parágrafo de texto.");
else if (aberturaPalavras > 90)
  laranja(G_GEO, "Resposta direta", `A abertura tem ${aberturaPalavras} palavras. Motor generativo cita bloco curto e autossuficiente, até 90.`);
else verde(G_GEO, "Resposta direta", `Abertura com ${aberturaPalavras} palavras.`);

const titulosPergunta = titulos.filter((t) =>
  /\?|^(como|quanto|qual|quais|quando|onde|por que|vale a pena|o que)/i.test(t.texto),
).length;
if (!titulosPergunta) laranja(G_GEO, "Títulos em pergunta", "Nenhum subtítulo em forma de pergunta. É por pergunta que a IA acha o trecho.");
else verde(G_GEO, "Títulos em pergunta", `${titulosPergunta} de ${titulos.length}.`);

const temFaq = titulos.some((t) => /perguntas frequentes|d[úu]vidas|faq/i.test(t.texto));
if (!temFaq) laranja(G_GEO, "Bloco de FAQ", "Sem seção de perguntas frequentes. É o formato que mais vira citação e resposta.");
else verde(G_GEO, "Bloco de FAQ", "Presente.");

const numeros = (puro.match(/\b\d+([.,]\d+)?\s*(%|km|min|minutos|reais|R\$|dias|horas|vagas)/gi) || []).length;
if (numeros < 5) laranja(G_GEO, "Dados citáveis", `${numeros} números com unidade. Modelo cita número com contexto, não adjetivo.`);
else verde(G_GEO, "Dados citáveis", `${numeros} números com unidade.`);

const listas = (corpo.match(/^\s*(?:[-*]|\d+\.)\s+/gm) || []).length;
if (listas < 8) laranja(G_GEO, "Listas", `${listas} itens de lista. Lista e tabela são o que o modelo consegue extrair inteiro.`);
else verde(G_GEO, "Listas", `${listas} itens de lista.`);

if (!meta.destination) laranja(G_GEO, "Entidade do destino", "Front matter sem `destination`. Sem ele o post não entra no grafo do aeroporto.");
else verde(G_GEO, "Entidade do destino", meta.destination);

// ------------------------------------------------------------------ relatório

const ORDEM = { vermelho: 0, laranja: 1, verde: 2 };
const MARCA = { verde: "  ok ", laranja: "  !! ", vermelho: "  XX " };
const grupos = [...new Set(achados.map((a) => a.grupo))];
const vermelhos = achados.filter((a) => a.nivel === "vermelho").length;
const laranjas = achados.filter((a) => a.nivel === "laranja").length;
const verdes = achados.filter((a) => a.nivel === "verde").length;

if (flag("json")) {
  console.log(JSON.stringify({ arquivo, meta, palavras, achados, resumo: { verdes, laranjas, vermelhos } }, null, 2));
} else {
  console.log(`\nAnálise de ${path.basename(arquivo)}  (${palavras} palavras, ${listaFrases.length} frases)\n`);
  for (const g of grupos) {
    const doGrupo = achados
      .filter((a) => a.grupo === g)
      .filter((a) => !flag("silencioso") || a.nivel !== "verde")
      .sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]);
    if (!doGrupo.length) continue;
    console.log(g);
    for (const a of doGrupo) console.log(`${MARCA[a.nivel]}${a.titulo}: ${a.texto}`);
    console.log("");
  }
  const nota = vermelhos ? "VERMELHO" : laranjas > 3 ? "LARANJA" : "VERDE";
  console.log(`Resultado: ${nota}  (${verdes} ok, ${laranjas} atenção, ${vermelhos} bloqueio)\n`);
  if (vermelhos) console.log("Corrija os bloqueios antes de publicar.\n");
}

process.exit(vermelhos ? 1 : 0);
