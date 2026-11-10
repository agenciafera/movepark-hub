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
 *
 * Onde sai: `onde: [feed, story]` no front matter. Sem o campo, os dois (padrão desde 22/10/2026).
 * Com story, cada slide `x.jpg` precisa do seu `x-story.jpg` (9:16) na mesma pasta, gerado pelo
 * render-story.mjs a partir do HTML do slide.
 *
 * Reel (desde 10/11/2026): `tipo: reel`, `video: <arquivo>.mp4` e `capa: <arquivo>.jpg` (9:16), os
 * dois na pasta. O script mede o MP4 com o ffprobe, faz o remux sem recodificar (moov no início,
 * sem edit list), sobe o vídeo direto para o bucket pela URL assinada que a Edge emite e manda o
 * rascunho com a capa. Precisa do ffmpeg no PATH. O reel sai só no feed.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { nomeDoStory } from "./render-story.mjs";
import { conferirVideo } from "./render-reel.mjs";
import { argsDoRemux, errosDoReel, hashDoVideo, videoDoProbe } from "./reel-envio.mjs";

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
const ehReel = meta.tipo === "reel";

// O reel tem nomes próprios (vídeo e capa) e sai só no feed. Conferir antes de medir o vídeo
// deixa o erro de nome aparecer sem precisar do ffmpeg.
if (ehReel) {
  const erros = errosDoReel(meta);
  if (erros.length) {
    console.error(`O rascunho do reel tem problema:\n  ${erros.join("\n  ")}`);
    process.exit(1);
  }
}

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
// No reel, a capa é o slide único: é ela que a prévia e a grade mostram.
const slides = ehReel
  ? [{ arquivo: String(meta.capa), alt: null, texto: null }]
  : (meta.slides ?? []).map((s) => ({ arquivo: s.arquivo, alt: s.alt ?? null, texto: s.texto ?? null }));

// Onde sai. Sem `onde`, feed e stories; o reel, só feed.
const onde = meta.onde === undefined ? (ehReel ? ["feed"] : ["feed", "story"]) : [meta.onde].flat().map((l) => String(l).trim());
const desconhecidos = onde.filter((l) => l !== "feed" && l !== "story");
if (desconhecidos.length || !onde.length) {
  console.error(`onde aceita feed e story (veio: ${onde.join(", ") || "vazio"}).`);
  process.exit(1);
}
const placements = ["feed", "story"].filter((l) => onde.includes(l));
const stories = placements.includes("story") ? slides.map((s) => ({ arquivo: nomeDoStory(s.arquivo) })) : [];
// 2b. O vídeo do reel: medido, remuxado e com o endereço do conteúdo. O envio vem no passo 3.
let reel = null;
if (ehReel) {
  const original = path.join(pasta, String(meta.video));
  if (!fs.existsSync(original)) {
    console.error(`Não achei ${original}`);
    process.exit(1);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reel-"));
  const remux = path.join(tmp, String(meta.video));
  try {
    execFileSync("ffmpeg", argsDoRemux(original, remux), { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    console.error(`O ffmpeg não conseguiu preparar o vídeo (brew install ffmpeg se faltar): ${e.stderr ?? e.message}`);
    process.exit(1);
  }
  const probe = JSON.parse(
    execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", remux], { encoding: "utf8" }),
  );
  const bytes = fs.readFileSync(remux);
  const { bloqueios, avisos } = conferirVideo(probe, bytes.length);
  for (const a of avisos) console.error(`aviso: ${a}`);
  if (bloqueios.length) {
    console.error(`O MP4 não passa na especificação da Meta:\n  ${bloqueios.join("\n  ")}`);
    process.exit(1);
  }
  reel = { caminho: remux, bytes, video: videoDoProbe(probe, { arquivo: String(meta.video), hash: hashDoVideo(bytes), bytes: bytes.length }) };
}

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
  placements,
  stories,
  ...(reel ? { video: reel.video } : {}),
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
for (const s of stories) {
  const p = path.join(pasta, s.arquivo);
  if (!fs.existsSync(p)) {
    console.error(
      `Não achei ${p}, o story 9:16 do slide. Gere a partir do HTML do slide:\n` +
        `  node .claude/skills/instagram/scripts/render-story.mjs <slide.html> ${p}\n` +
        "Ou ponha onde: [feed] no front matter para sair só no feed.",
    );
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

// O MP4 sobe antes do rascunho, direto para o bucket. A Edge só assina o caminho.
if (reel) {
  let pedido;
  try {
    const r = await fetch(`${url}/functions/v1/social-draft`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-social-draft-key": chave },
      body: JSON.stringify({ action: "video_upload_url", origem: post.origem, corte: post.corte, arquivo: reel.video.arquivo, hash: reel.video.hash, bytes: reel.video.bytes }),
      signal: AbortSignal.timeout(30_000),
    });
    pedido = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error(JSON.stringify(pedido, null, 2));
      if (r.status === 401) console.error("\nA plataforma recusou a chave. Confira SOCIAL_DRAFT_KEY em .env.local.");
      process.exit(1);
    }
  } catch (e) {
    console.error(`Não consegui falar com a plataforma: ${e.message}`);
    process.exit(1);
  }
  if (!pedido.ja_existe) {
    const anon = lerEnv("VITE_SUPABASE_ANON_KEY");
    const destino = `${url}/storage/v1/object/upload/sign/social-video/${pedido.path}?token=${encodeURIComponent(pedido.token)}`;
    console.error(`Subindo ${reel.video.arquivo} (${(reel.video.bytes / 1048576).toFixed(1)} MB)...`);
    let subida;
    try {
      subida = await fetch(destino, {
        method: "PUT",
        headers: { "content-type": "video/mp4", "cache-control": "max-age=31536000", ...(anon ? { apikey: anon } : {}) },
        body: reel.bytes,
        signal: AbortSignal.timeout(600_000),
      });
    } catch (e) {
      console.error(`O envio do vídeo caiu: ${e.message}`);
      process.exit(1);
    }
    if (!subida.ok) {
      console.error(`O bucket recusou o vídeo (HTTP ${subida.status}): ${await subida.text()}`);
      process.exit(1);
    }
  }
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
