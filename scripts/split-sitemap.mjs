#!/usr/bin/env node
/**
 * Divide o `dist/sitemap.xml` em um arquivo por seção e reescreve o `sitemap.xml` como
 * `<sitemapindex>`.
 *
 * Roda DEPOIS do `canonicalize-sitemap.mjs`, de propósito: fatia um arquivo já com a barra
 * final do blog reposta e já sem área logada, então não precisa saber nada sobre nenhuma das
 * duas coisas.
 *
 * A classificação NÃO é derivada de prefixo de path. Ela vem do mapa que o `vite.config.ts`
 * emite, montado a partir das mesmas variáveis que buscaram as URLs no banco. O repo já tem
 * duas listas de prefixo que divergiram (SITEMAP_PRIVATE_PREFIXES com cinco entradas,
 * PRIVADOS do canonicalize com doze); uma terceira seria drift garantido.
 *
 * Desenho em docs/superpowers/specs/2026-08-17-sitemap-por-secao-design.md.
 */

import fs from "node:fs";
import path from "node:path";

import { dividirSitemap } from "./sitemap-split.logic.mjs";

const SITEMAP = "dist/sitemap.xml";
const MAPA = "node_modules/.cache/movepark-sitemap-sections.json";

/**
 * Seções alimentadas por consulta ao Supabase. Qualquer uma vazia é o mesmo sintoma que o
 * `write-paths-manifest.mjs` já trata como fatal: banco mudo durante o build. Publicar o
 * índice assim tiraria a seção inteira do anúncio e deixaria a redescoberta por conta só do
 * link interno. `paginas` fica de fora porque vem de lista literal e não tem como esvaziar.
 */
const SECOES_DO_BANCO = ["blog", "destinos", "estacionamentos", "faq", "precos", "unidades"];

/**
 * `mais-barato` fica fora da lista obrigatória de propósito: ela é um subconjunto filtrado da
 * mesma RPC que alimenta `precos` (só destino com preço de vaga não-moto), então pode ficar
 * legitimamente vazia sem o banco estar mudo, e a saúde da RPC já é cobrada em `precos`.
 * Seção vazia nunca some em silêncio: o script lista todas no fim.
 */

function abortar(mensagem) {
  console.error(`sitemap: ${mensagem}`);
  process.exit(1);
}

if (!fs.existsSync(SITEMAP)) abortar(`${SITEMAP} não existe. Rode o build antes.`);
if (!fs.existsSync(MAPA)) {
  abortar(
    `mapa de seções não encontrado em ${MAPA}. Ele é gravado pelo plugin do vite.config.ts ` +
      "durante o build; sem ele o split adivinharia a classificação, e é justamente isso que " +
      "este desenho evita.",
  );
}

const mapa = JSON.parse(fs.readFileSync(MAPA, "utf8"));

const vazias = SECOES_DO_BANCO.filter((secao) => !mapa[secao]?.length);
if (vazias.length > 0) {
  abortar(
    `seção sem nenhuma URL: ${vazias.join(", ")}. Sinal de que o Supabase não respondeu ` +
      "durante o build. Abortando para o índice não anunciar seção vazia.",
  );
}

const xml = fs.readFileSync(SITEMAP, "utf8");
const entrada = (xml.match(/<url>/g) ?? []).length;

let resultado;
try {
  resultado = dividirSitemap(xml, mapa);
} catch (erro) {
  abortar(erro.message);
}

const { arquivos, indice, orfas } = resultado;

// Invariante: a fatia não pode perder nem duplicar URL.
const total = arquivos.reduce((soma, arquivo) => soma + arquivo.urls, 0);
if (total !== entrada) {
  abortar(`entrou com ${entrada} URLs e saiu com ${total} depois da fatia. Abortando.`);
}

for (const arquivo of arquivos) {
  fs.writeFileSync(path.join("dist", arquivo.nome), arquivo.conteudo);
}
fs.writeFileSync(SITEMAP, indice);

// Mapa apagado depois de lido: assim não existe mapa velho de build anterior para o próximo
// split usar por engano. Sem mapa, ele falha alto em vez de classificar errado.
fs.rmSync(MAPA);

const resumo = arquivos.map((a) => `${a.nome} (${a.urls})`).join(", ");
console.log(`sitemap: índice com ${arquivos.length} arquivos, ${total} URLs. ${resumo}`);

// Seção declarada que não virou arquivo. Não derruba o build (pode ser estado legítimo de
// conteúdo), mas some do índice, e sumiço em silêncio é o que faz ninguém notar.
const semUrl = Object.keys(mapa).filter(
  (secao) => !arquivos.some((a) => a.nome === `sitemap-${secao}.xml`),
);
if (semUrl.length > 0) {
  console.log(`sitemap: seção sem nenhuma URL, fora do índice: ${semUrl.join(", ")}`);
}

if (orfas.length > 0) {
  console.warn(
    `sitemap: ${orfas.length} URL(s) fora do mapa de seções, jogadas em sitemap-paginas.xml: ` +
      `${orfas.join(", ")}. Sinal de página que o plugin descobriu varrendo o dist.`,
  );
}
