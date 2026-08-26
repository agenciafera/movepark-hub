/**
 * Aplica o bloco de FAQ nos posts: escreve o `.md` do repo e emite o SQL do banco.
 *
 * Entrada: um ou mais JSON `{ "<slug>": { "angulo": "...", "faq": [{ "q": "", "a": "" }] } }`.
 * Saída:   public/blog/<slug>.md reescrito (no worktree) + faq.sql com o UPDATE.
 *
 * O bloco é appendado no fim do corpo, e o `.md` do repo é o `body_md` mais uma
 * quebra final, então o mesmo texto serve para os dois lados sem transformação.
 */
import fs from "node:fs";
import path from "node:path";

const REPO = process.argv[2];
const ENTRADAS = process.argv.slice(3);
if (!REPO || !ENTRADAS.length) {
  console.error("uso: node aplicar.mjs <caminho-do-worktree> <faq-*.json...>");
  process.exit(1);
}

/** Perguntas que já têm página própria em /faq/<slug>: repetir aqui é canibalizar. */
const CANONICAS = fs
  .readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "faq-canonicas.txt"), "utf8")
  .split("\n")
  .filter(Boolean);

const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const STOP = new Set(
  ("o a os as de do da dos das no na nos nas em um uma e ou para por com que se voce meu minha seu sua qual quais " +
    "aeroporto estacionamento estacionamentos terminal guarulhos viracopos campinas congonhas confins curitiba " +
    "afonso pena navegantes recife lisboa").split(" "),
);
const toks = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a, b) => {
  const A = toks(a);
  const B = toks(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 0;
};

const PROMESSAS =
  /vaga garantida|garantimos|cancelamento gr[áa]tis|cancelamento gratuito|reembolso garantido|pre[çc]o fixo|sempre ter[áa]|100% seguro|garantia de vaga/i;

const posts = {};
for (const arq of ENTRADAS) Object.assign(posts, JSON.parse(fs.readFileSync(arq, "utf8")));

const problemas = [];
const vistoPorAeroporto = {};
const sqls = [];
let okCount = 0;

for (const [slug, dados] of Object.entries(posts)) {
  const arquivo = path.join(REPO, "public/blog", `${slug}.md`);
  if (!fs.existsSync(arquivo)) {
    problemas.push(`${slug}: XX arquivo .md nao existe`);
    continue;
  }
  const faq = dados.faq ?? [];
  if (faq.length < 5) problemas.push(`${slug}: XX so ${faq.length} perguntas (minimo 5)`);

  const grupo = (vistoPorAeroporto[dados.aeroporto ?? "?"] ??= new Set());
  for (const { q, a } of faq) {
    if (!q.trim().endsWith("?")) problemas.push(`${slug}: XX pergunta sem "?": ${q}`);
    if (/[—–]/.test(q + a)) problemas.push(`${slug}: XX travessao em: ${q}`);
    if (PROMESSAS.test(a)) problemas.push(`${slug}: XX promessa (ADR-009) em: ${q}`);
    const palavras = a.trim().split(/\s+/).length;
    if (palavras < 35 || palavras > 70) problemas.push(`${slug}: !! resposta com ${palavras} palavras: ${q}`);
    if (/R\$/.test(a) && !/(de )?(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de \d{4}/.test(a))
      problemas.push(`${slug}: XX R$ sem data de referencia: ${q}`);
    for (const c of CANONICAS)
      if (jaccard(q, c) >= 0.6) problemas.push(`${slug}: XX colide com /faq: "${q}" ~ "${c}"`);
    const chave = norm(q);
    if (grupo.has(chave)) problemas.push(`${slug}: XX pergunta repetida no mesmo aeroporto: ${q}`);
    grupo.add(chave);
  }

  const bloco =
    "\n\n## Perguntas frequentes\n\n" +
    faq.map(({ q, a }) => `### ${q.trim()}\n\n${a.trim()}`).join("\n\n") +
    "\n";

  const atual = fs.readFileSync(arquivo, "utf8");
  const corte = atual.indexOf("\n---\n");
  if (corte < 0) {
    problemas.push(`${slug}: XX .md sem cabecalho terminado em ---`);
    continue;
  }
  if (/^## Perguntas frequentes$/m.test(atual)) {
    problemas.push(`${slug}: XX ja tem bloco "Perguntas frequentes", nao vou duplicar`);
    continue;
  }

  const corpoAtual = atual.slice(corte + 5).replace(/\n+$/, "");
  const promoveH3 = !/^## /m.test(corpoAtual) && /^### /m.test(corpoAtual);
  const corpoBase = promoveH3 ? corpoAtual.replace(/^### /gm, "## ") : corpoAtual;
  const corpoNovo = corpoBase + bloco;

  fs.writeFileSync(arquivo, atual.slice(0, corte + 5) + corpoNovo + "\n");

  const dollar = (s) => `$mvpk$${s}$mvpk$`;
  sqls.push(
    promoveH3
      ? `update public.blog_post set body_md = regexp_replace(body_md, '(?m)^### ', '## ', 'g') || ${dollar(bloco)} where slug = ${dollar(slug)};`
      : `update public.blog_post set body_md = body_md || ${dollar(bloco)} where slug = ${dollar(slug)};`,
  );
  okCount += 1;
}

fs.writeFileSync(path.join(path.dirname(ENTRADAS[0]), "faq.sql"), sqls.join("\n") + "\n");

const bloqueios = problemas.filter((p) => p.includes("XX"));
console.log(`posts processados: ${okCount} de ${Object.keys(posts).length}`);
console.log(`bloqueios: ${bloqueios.length} | avisos: ${problemas.length - bloqueios.length}`);
problemas.forEach((p) => console.log("  " + p));
process.exit(bloqueios.length ? 1 : 0);
