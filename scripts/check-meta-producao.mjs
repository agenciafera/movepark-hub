#!/usr/bin/env node
/**
 * Varredura de `<title>` e `<meta name="description">` do que está NO AR.
 *
 * O `src/seo-meta.contract.test.ts` cobre o texto literal dos arquivos de rota, que é o que
 * dá para verificar sem subir o site. Só que metade das descriptions é montada em tempo de
 * execução com o preço do motor, e o `<title>` de página gerada varia de tamanho com o nome
 * do aeroporto e com o texto da pergunta. Isso só aparece renderizado.
 *
 * Foi assim que a varredura de 22/09/2026 achou, depois do deploy, o que o teste não pegava:
 * o título de `/estacionamentos/<destino>/mais-barato` saía com 71 caracteres (o Google
 * cortava a marca), o da pergunta do FAQ com 66, e a description da calculadora fechava em
 * 107 porque o complemento era longo demais para caber junto do preço.
 *
 * Uso:
 *   node scripts/check-meta-producao.mjs                       # https://movepark.co
 *   node scripts/check-meta-producao.mjs http://localhost:5173 # contra o preview
 *
 * Sai com código 1 quando alguma URL fura a regra, para servir de gate manual depois de um
 * deploy que mexeu em copy de SERP.
 */

const BASE = (process.argv[2] ?? "https://movepark.co").replace(/\/+$/, "");

/**
 * Uma URL de cada formato de página. Não é a lista inteira do site de propósito: o que varia
 * entre dois aeroportos é o dado, não a regra, e a varredura tem que caber num café.
 */
const URLS = [
  "/",
  "/estacionamentos",
  "/estacionamentos/aeroporto-guarulhos",
  "/estacionamentos/aeroporto-guarulhos/precos",
  "/estacionamentos/aeroporto-guarulhos/mais-barato",
  "/estacionamentos/aeroporto-guarulhos/aerovalet",
  "/precos",
  "/calculadora-estacionamento-aeroporto",
  "/blog/",
  "/blog/garageinn-viracopos/",
  "/faq",
  "/faq/como-cancelo-uma-reserva",
  "/sobre",
  "/como-funciona",
  "/contato",
  "/ajuda",
  "/cancelamento",
  "/metodologia",
  "/seja-parceiro",
  "/descontos",
  "/grupo",
  "/selo",
  "/termos",
  "/privacidade",
];

/**
 * Páginas cuja palavra-chave é o próprio nome institucional. "Termos de Uso de
 * estacionamento" não é consulta de ninguém, e enfiar a palavra ali seria stuffing. Elas
 * seguem obrigadas a tamanho, CTA e ausência de travessão.
 */
const SEM_PALAVRA_CHAVE = new Set(["/termos", "/privacidade"]);

/**
 * Páginas cuja palavra-chave é uma marca (do parceiro ou de um produto do grupo), que nenhum
 * padrão genérico reconhece. A checagem de núcleo sai; o resto continua.
 */
const CHAVE_DE_MARCA = new Set(["/blog/garageinn-viracopos/", "/estacionamentos/aeroporto-guarulhos/aerovalet"]);

const TITLE_MAX = 62;
const META_MIN = 120;
const META_MAX = 160;
const NUCLEO = /estacionament|vaga|reserva|preço|aeroporto|parque|cupom|desconto/i;
const CTA = /\b(reserve|compare|confira|veja|fale|leia|chame|cadastre|busque|escolha|conheça)\b/i;

/** O `<meta>` sai do HTML com entidade; o que conta é o texto que o Google lê. */
function decode(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

let fora = 0;
for (const caminho of URLS) {
  let html = "";
  try {
    const r = await fetch(BASE + caminho, { redirect: "follow" });
    html = await r.text();
  } catch (e) {
    console.log(`✗ ${caminho}\n   não respondeu: ${e.message}`);
    fora += 1;
    continue;
  }

  const title = decode(html.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? "").trim();
  const desc = decode(html.match(/name="description"\s+content="([^"]*)"/)?.[1] ?? "").trim();
  const problemas = [];

  if (!title) problemas.push("sem title");
  else {
    if (title.length > TITLE_MAX) problemas.push(`title com ${title.length} caracteres`);
    if (!NUCLEO.test(title) && !SEM_PALAVRA_CHAVE.has(caminho) && !CHAVE_DE_MARCA.has(caminho)) {
      problemas.push("title sem palavra-chave");
    }
  }

  if (!desc) problemas.push("sem description");
  else {
    if (desc.length < META_MIN) problemas.push(`description com ${desc.length} caracteres`);
    if (desc.length > META_MAX) problemas.push(`description com ${desc.length} caracteres`);
    if (!NUCLEO.test(desc.slice(0, 60)) && !SEM_PALAVRA_CHAVE.has(caminho) && !CHAVE_DE_MARCA.has(caminho)) {
      problemas.push("palavra-chave fora da abertura");
    }
    const ultimaFrase = desc.split(/(?<=[.!?])\s+/).at(-1) ?? desc;
    if (!CTA.test(ultimaFrase)) problemas.push(`fecha sem CTA: "${ultimaFrase}"`);
  }

  if (/[—–]/.test(title) || /[—–]/.test(desc)) problemas.push("travessão");

  if (problemas.length === 0) {
    console.log(`✓ ${caminho}`);
    continue;
  }
  fora += 1;
  console.log(`✗ ${caminho}`);
  console.log(`   ${problemas.join(" | ")}`);
  console.log(`   T(${title.length}) ${title}`);
  console.log(`   D(${desc.length}) ${desc}`);
}

console.log(`\n${URLS.length} URLs em ${BASE}, ${fora} fora da regra`);
process.exit(fora === 0 ? 0 : 1);
