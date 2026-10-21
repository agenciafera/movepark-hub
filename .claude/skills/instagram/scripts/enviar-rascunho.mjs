#!/usr/bin/env node
/**
 * Envia um rascunho pronto da skill para a fila do Instagram na plataforma (E3.6).
 *
 * Roda o analisador antes e aborta se houver bloqueio. A plataforma confere de novo, mas só o
 * que quebra a publicação ou a marca; o resto da régua da skill mora no analisador.
 *
 * Uso:
 *   node .claude/skills/instagram/scripts/enviar-rascunho.mjs <rascunho.md> [--pasta <dir>] [--seco]
 *
 * Os JPEGs são procurados ao lado do .md, a não ser que --pasta diga outro lugar. Com --seco,
 * mostra o que mandaria e não envia (nem toca na rede). A chave vem de SOCIAL_DRAFT_KEY
 * (ambiente ou .env.local) e a URL de VITE_SUPABASE_URL (.env). `--hoje=AAAA-MM-DD` fixa o "hoje"
 * do analisador (teste). Ver docs/specs/instagram-fila-de-publicacao.md.
 *
 * Notícia (origem `fato-...`): a fila ainda não guarda fonte nem validade, então a conferência do
 * prazo é daqui, e a aprovação tem que sair no mesmo dia.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../../..");
const USO = "uso: enviar-rascunho.mjs <rascunho.md> [--pasta <dir>] [--seco]";

let arquivo = null;
let pasta = null;
let seco = false;
let hoje = null;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--pasta") pasta = args[++i];
  else if (args[i] === "--seco") seco = true;
  else if (args[i].startsWith("--hoje=")) hoje = args[i].slice("--hoje=".length);
  else if (args[i].startsWith("--")) {
    console.error(`Opção desconhecida: ${args[i]}\n${USO}`);
    process.exit(2);
  } else arquivo = args[i];
}
if (!arquivo) {
  console.error(USO);
  process.exit(2);
}
if (!fs.existsSync(arquivo)) {
  console.error(`Não achei o rascunho ${arquivo}`);
  process.exit(1);
}
pasta = pasta ?? path.dirname(path.resolve(arquivo));

function lerEnv(nome) {
  if (process.env[nome]) return process.env[nome];
  for (const f of [".env.local", ".env"]) {
    const p = path.join(RAIZ, f);
    if (!fs.existsSync(p)) continue;
    const linha = fs.readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${nome}=`));
    if (linha) return linha.slice(nome.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

// 1. O analisador decide se o rascunho pode sair daqui.
let analise;
try {
  const cmd = [path.join(AQUI, "analisar-carrossel.mjs"), arquivo, "--json"];
  if (hoje) cmd.push(`--hoje=${hoje}`);
  analise = JSON.parse(execFileSync(process.execPath, cmd, { encoding: "utf8" }));
} catch (e) {
  // Com bloqueio ele sai com código 1, mas o JSON vem inteiro no stdout.
  if (!e.stdout) throw e;
  analise = JSON.parse(e.stdout);
}

const meta = analise.meta;
const ehNoticia = String(meta.origem_post ?? meta.origem ?? "").startsWith("fato-");

// Notícia vencida não entra na fila: ela ainda não guarda a validade, então nada lá barraria a
// aprovação de um fato que já acabou. Vem antes dos bloqueios para a mensagem ser a do prazo.
const diaDe = (s) => /^\d{4}-\d{2}-\d{2}/.exec(String(s ?? ""))?.[0] ?? null;
if (ehNoticia && diaDe(meta.publicar_em) && diaDe(meta.validade) && diaDe(meta.publicar_em) > diaDe(meta.validade)) {
  console.error(
    `Notícia agendada para ${diaDe(meta.publicar_em)}, depois da validade (${diaDe(meta.validade)}). ` +
      "A fila ainda não confere o prazo, então a trava é aqui. Antecipe a data ou descarte o post.",
  );
  process.exit(1);
}

const bloqueios = analise.achados.filter((a) => a.nivel === "vermelho");
if (bloqueios.length) {
  console.error("O analisador achou bloqueio. Corrija antes de enviar:\n");
  for (const b of bloqueios) console.error(`  XX ${b.grupo} / ${b.titulo}: ${b.texto}`);
  process.exit(1);
}

// 2. O payload, no formato que a Edge social-draft lê.
const bruto = fs.readFileSync(arquivo, "utf8");
const caption = bruto.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
const publicarEm = /^\d{4}-\d{2}-\d{2}$/.test(meta.publicar_em ?? "")
  ? `${meta.publicar_em}T12:00:00-03:00`
  : (meta.publicar_em ?? null);
const slides = (meta.slides ?? []).map((s) => ({ arquivo: s.arquivo, alt: s.alt ?? null, texto: s.texto ?? null }));
const post = {
  origem: meta.origem_post ?? meta.origem,
  corte: meta.corte ? Number(meta.corte) : null,
  tipo: meta.tipo,
  destination: meta.destination ?? null,
  keyphrase: meta.keyphrase ?? null,
  publicar_em: publicarEm,
  cta_url: meta.cta_url ?? null,
  price_date: meta.price_date ?? null,
  caption,
  slides,
};

const form = new FormData();
form.append("post", JSON.stringify(post));
for (const s of slides) {
  const p = path.join(pasta, s.arquivo);
  if (!fs.existsSync(p)) {
    console.error(`Não achei ${p}`);
    process.exit(1);
  }
  form.append(s.arquivo, new Blob([fs.readFileSync(p)], { type: "image/jpeg" }), s.arquivo);
}

if (ehNoticia) {
  console.error(
    `Notícia: a fila ainda não confere a validade (${meta.validade}). Aprove no mesmo dia, ` +
      "dentro do prazo, e reabra a fonte antes de aprovar.",
  );
}

if (seco) {
  console.log(JSON.stringify({ ...post, caption: `${caption.slice(0, 80)}...` }, null, 2));
  process.exit(0);
}

// 3. O envio.
const url = lerEnv("VITE_SUPABASE_URL");
const chave = lerEnv("SOCIAL_DRAFT_KEY");
if (!url || !chave) {
  console.error("Faltou VITE_SUPABASE_URL (.env) ou SOCIAL_DRAFT_KEY (.env.local).");
  process.exit(1);
}
let r;
try {
  r = await fetch(`${url}/functions/v1/social-draft`, {
    method: "POST",
    headers: { "x-social-draft-key": chave },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
} catch (e) {
  console.error(`Não consegui falar com a plataforma: ${e.message}`);
  process.exit(1);
}
const corpo = await r.json().catch(() => ({}));
console.log(JSON.stringify(corpo, null, 2));
if (!r.ok) {
  if (r.status === 401) console.error("\nA plataforma recusou a chave. Confira SOCIAL_DRAFT_KEY em .env.local.");
  process.exit(1);
}
console.log("\nNa fila. Abra /manager/social para aprovar.");
