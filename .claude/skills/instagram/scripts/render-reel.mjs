#!/usr/bin/env node
/**
 * Renderiza um reel do Instagram a partir de cenas HTML (assets/reel-template.html), em
 * 1080 x 1920, e entrega o MP4 no formato que a Meta aceita, mais a capa em JPEG.
 *
 * Por que existe: o reel de número (preço por duração, faixa do mercado) é uma sequência de
 * cenas tipográficas, e montar isso num editor de vídeo à mão reabre os dois erros que o slide
 * já fechou: número digitado de novo, com chance de sair diferente do site, e fonte que não é a
 * Inter. Aqui cada cena é um HTML com o número escrito uma vez, e o vídeo sai dele.
 *
 * Como: o Chromium do Playwright abre cada cena, pausa as animações CSS e avança o relógio
 * quadro a quadro (30 por segundo). Cada quadro vai direto para o ffmpeg pela entrada padrão,
 * sem tocar no disco. O resultado é determinístico: a mesma cena sai igual em toda máquina.
 *
 * As mesmas travas do render-slide.mjs, porque as falhas são as mesmas e são silenciosas: foto
 * que não existe (o fundo cai no navy), CSS que não aplicou e texto de exemplo do template.
 *
 * O formato é o da documentação da Meta para reel (conferida em 23/10/2026, ver
 * ../references/api-instagram.md): MP4 com o moov no início e sem edit list, H.264 progressivo
 * com GOP fechado e 4:2:0, 30 fps, AAC estéreo a 48 kHz. Sem `--audio`, a faixa é muda: música
 * licenciada só entra pelo app, e a API não aceita trilha da biblioteca do Instagram. Com
 * `--audio`, a trilha dada (a narração, por exemplo) entra no lugar, completada com silêncio ou
 * cortada para durar o mesmo que o vídeo.
 *
 * Uso:
 *   node .claude/skills/instagram/scripts/render-reel.mjs <saida.mp4> <cena.html:segundos>... \
 *        [--capa capa.jpg] [--capa-cena 1] [--audio narracao.wav]
 *
 * Exemplo:
 *   node render-reel.mjs reel.mp4 cena-01.html:3 cena-02.html:3.5 cena-03.html:4 --capa capa.jpg
 *
 * A capa é a cena escolhida (a primeira, por padrão) com as animações de entrada concluídas.
 * O que CSS não anima (um contador que gira até o valor) a cena faz em `window.reelQuadro(ms)`:
 * o render chama a função a cada quadro com o instante da cena, depois de posicionar as animações.
 * Requer `bun install` (chromium do @playwright/test) e o ffmpeg no PATH (`brew install ffmpeg`
 * no macOS, `apt install ffmpeg` no Linux).
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const LARGURA = 1080;
export const ALTURA = 1920;
export const FPS = 30;
const QUALIDADE_QUADRO = 92;
const QUALIDADE_CAPA = 85;
const LIMITE_CAPA_BYTES = 8 * 1024 * 1024;

/** O que a Meta aceita em reel. Fonte: IG User Media, "Reel Specifications". */
export const META_REEL = {
  duracaoMinima: 3,
  duracaoMaxima: 15 * 60,
  larguraMaxima: 1920,
  fpsMinimo: 23,
  fpsMaximo: 60,
  bitrateMaximo: 25_000_000,
  bytesMaximo: 300 * 1024 * 1024,
  audioHzMaximo: 48_000,
};

/** Acima disso o reel deixa de ser curto e o número some antes de alguém ver. Só avisa. */
export const DURACAO_RECOMENDADA = 90;

/** `cena-01.html:3.5` → `{ html: "cena-01.html", segundos: 3.5 }`. */
export function lerCena(arg) {
  const m = /^(.+\.html?):(\d+(?:[.,]\d+)?)$/i.exec(String(arg));
  if (!m) throw new Error(`"${arg}" não é <cena.html>:<segundos> (ex.: cena-01.html:3.5).`);
  const segundos = Number(m[2].replace(",", "."));
  if (!(segundos >= 1)) throw new Error(`${m[1]}: a cena precisa de pelo menos 1 segundo (veio ${m[2]}).`);
  if (segundos > 20) throw new Error(`${m[1]}: ${segundos} s numa cena só. Divida em cenas menores.`);
  return { html: m[1], segundos };
}

/** Quantos quadros uma cena ocupa. Arredonda, para a soma das cenas bater com o relógio. */
export const quadrosDa = (segundos, fps = FPS) => Math.round(segundos * fps);

/**
 * Os argumentos do ffmpeg: quadros JPEG pela entrada padrão, a trilha (ou áudio mudo), saída no
 * formato da Meta. A trilha ganha silêncio no fim (`apad`) e o `-shortest` corta no fim do vídeo.
 */
export function argsDoFfmpeg(saida, fps = FPS, audio = null) {
  const trilha = audio
    ? ["-i", audio]
    : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];
  return [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    ...trilha,
    "-map", "0:v", "-map", "1:a", ...(audio ? ["-af", "apad"] : []), "-shortest",
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "medium",
    "-crf", "20", "-maxrate", "12M", "-bufsize", "24M",
    "-r", String(fps), "-g", String(fps * 2), "-keyint_min", String(fps * 2), "-sc_threshold", "0",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart", "-use_editlist", "0",
    saida,
  ];
}

/**
 * Confere o MP4 contra a especificação da Meta, a partir do JSON do ffprobe. Devolve os
 * bloqueios (a Meta recusaria) e os avisos (sai, mas fora do padrão da casa).
 */
export function conferirVideo(probe, bytes) {
  const bloqueios = [];
  const avisos = [];
  const video = probe.streams?.find((s) => s.codec_type === "video");
  const audio = probe.streams?.find((s) => s.codec_type === "audio");
  const duracao = Number(probe.format?.duration ?? video?.duration ?? 0);
  if (!video) return { bloqueios: ["O arquivo não tem faixa de vídeo."], avisos };

  if (!["h264", "hevc"].includes(video.codec_name)) bloqueios.push(`Vídeo em ${video.codec_name}; a Meta aceita H.264 ou HEVC.`);
  if (video.pix_fmt !== "yuv420p") bloqueios.push(`Cor em ${video.pix_fmt}; a Meta pede 4:2:0 (yuv420p).`);
  if (video.width > META_REEL.larguraMaxima) bloqueios.push(`${video.width} px de largura; o máximo é ${META_REEL.larguraMaxima}.`);
  const [n, d] = String(video.avg_frame_rate ?? video.r_frame_rate ?? "0/1").split("/").map(Number);
  const fps = d ? n / d : 0;
  if (fps < META_REEL.fpsMinimo || fps > META_REEL.fpsMaximo) bloqueios.push(`${fps.toFixed(2)} fps; a Meta aceita de 23 a 60.`);
  if (duracao < META_REEL.duracaoMinima) bloqueios.push(`${duracao.toFixed(1)} s; o reel tem no mínimo 3 s.`);
  if (duracao > META_REEL.duracaoMaxima) bloqueios.push(`${duracao.toFixed(0)} s; o reel tem no máximo 15 min.`);
  if (bytes > META_REEL.bytesMaximo) bloqueios.push(`${(bytes / 1048576).toFixed(0)} MB; o máximo é 300 MB.`);
  const bitrate = Number(probe.format?.bit_rate ?? 0);
  if (bitrate > META_REEL.bitrateMaximo) bloqueios.push(`${(bitrate / 1e6).toFixed(1)} Mbps; o máximo é 25.`);
  if (audio) {
    if (audio.codec_name !== "aac") bloqueios.push(`Áudio em ${audio.codec_name}; a Meta pede AAC.`);
    if (Number(audio.sample_rate) > META_REEL.audioHzMaximo) bloqueios.push(`Áudio a ${audio.sample_rate} Hz; o máximo é 48 kHz.`);
    if (Number(audio.channels) > 2) bloqueios.push(`${audio.channels} canais de áudio; a Meta aceita mono ou estéreo.`);
  }

  if (video.width !== LARGURA || video.height !== ALTURA) avisos.push(`${video.width}x${video.height}; o padrão da casa é ${LARGURA}x${ALTURA} (9:16).`);
  if (duracao > DURACAO_RECOMENDADA) avisos.push(`${duracao.toFixed(0)} s; reel de número funciona abaixo de ${DURACAO_RECOMENDADA} s.`);
  if (!audio) avisos.push("Sem faixa de áudio. A Meta aceita, mas o padrão da casa leva a faixa muda.");
  return { bloqueios, avisos };
}

// ------------------------------------------------------------------- execução

/** Abre a cena, confere as travas e devolve a página com as animações pausadas. */
async function abrirCena(browser, cena) {
  const html = path.resolve(cena.html);
  if (!fs.existsSync(html)) throw new Error(`não achei a cena: ${html}`);
  const page = await browser.newPage({ viewport: { width: LARGURA, height: ALTURA }, deviceScaleFactor: 1 });
  const falharam = [];
  page.on("requestfailed", (req) => req.resourceType() === "image" && falharam.push(req.url()));
  await page.goto(pathToFileURL(html).href);
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: `:root{--dur:${cena.segundos}s !important}` });
  await page.evaluate(() => document.fonts.ready);
  // A foto entra como background do CSS e a requisição só sai quando o estilo resolve.
  await page.waitForLoadState("networkidle");
  const nome = path.basename(html);
  if (falharam.length) {
    await page.close();
    throw new Error(`${nome} tentou carregar imagem que não existe, então sairia sem foto: ${falharam.join(", ")}`);
  }
  const estado = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return {
      fundo: cs.backgroundColor,
      imagem: cs.backgroundImage,
      fonte: cs.fontFamily,
      texto: (document.body.innerText || "").trim().length,
      exemplos: [...document.querySelectorAll("[data-exemplo]")].map((e) => (e.innerText || "").trim().slice(0, 60)),
    };
  });
  const problema =
    estado.fundo === "rgba(0, 0, 0, 0)" && estado.imagem === "none"
      ? "o body não recebeu fundo, então o CSS do template não aplicou"
      : !estado.texto
        ? "renderizou sem texto visível"
        : estado.exemplos.length
          ? `ainda tem conteúdo de exemplo do template (${estado.exemplos.map((e) => `"${e}"`).join(", ")}); edite e remova o data-exemplo`
          : null;
  if (problema) {
    await page.close();
    throw new Error(`${nome}: ${problema}.`);
  }
  if (!/Inter/i.test(estado.fonte)) console.warn(`aviso: ${nome} usa ${estado.fonte}, e a fonte da marca é Inter.`);
  // Pausa tudo: daqui em diante quem anda o relógio é o render.
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  return page;
}

/** Põe todas as animações no instante `ms`, chama o gancho da cena e devolve o quadro em JPEG. */
async function quadro(page, ms, qualidade = QUALIDADE_QUADRO) {
  await page.evaluate((t) => {
    document.getAnimations().forEach((a) => (a.currentTime = t));
    if (typeof window.reelQuadro === "function") window.reelQuadro(t);
  }, ms);
  return page.screenshot({ type: "jpeg", quality: qualidade });
}

/** Instante em que as entradas terminam (a foto que cresce a cena inteira não conta). */
const fimDasEntradas = (page) =>
  page.evaluate(() =>
    Math.max(
      0,
      ...document
        .getAnimations()
        .filter((a) => a.animationName !== "cresce")
        .map((a) => Number(a.effect?.getComputedTiming().endTime) || 0),
    ),
  );

function escrever(stream, buf) {
  return stream.write(buf) ? Promise.resolve() : new Promise((ok) => stream.once("drain", ok));
}

function temFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function principal(argv) {
  const cenasArg = [];
  let saida = null;
  let capa = null;
  let capaCena = 1;
  let audio = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--capa") capa = argv[++i];
    else if (argv[i] === "--capa-cena") capaCena = Number(argv[++i]);
    else if (argv[i] === "--audio") audio = argv[++i];
    else if (argv[i].startsWith("--")) throw new Error(`opção desconhecida: ${argv[i]}`);
    else if (!saida) saida = argv[i];
    else cenasArg.push(argv[i]);
  }
  if (!saida || !/\.mp4$/i.test(saida) || !cenasArg.length) {
    throw new Error(
      "uso: render-reel.mjs <saida.mp4> <cena.html:segundos>... [--capa capa.jpg] [--capa-cena 1] [--audio trilha.wav]",
    );
  }
  const cenas = cenasArg.map(lerCena);
  if (!(capaCena >= 1 && capaCena <= cenas.length)) throw new Error(`--capa-cena ${capaCena} não existe (são ${cenas.length} cenas).`);
  if (audio && !fs.existsSync(audio)) throw new Error(`não achei a trilha: ${audio}`);
  if (!temFfmpeg()) throw new Error("ffmpeg e ffprobe não estão no PATH. No macOS: brew install ffmpeg; no Linux: apt install ffmpeg.");

  saida = path.resolve(saida);
  const { chromium } = (await import("@playwright/test")).default;
  const browser = await chromium.launch();
  const ff = spawn("ffmpeg", argsDoFfmpeg(saida, FPS, audio && path.resolve(audio)), { stdio: ["pipe", "ignore", "pipe"] });
  let erroFf = "";
  ff.stderr.on("data", (d) => (erroFf += d));
  const fim = new Promise((ok, falha) =>
    ff.on("close", (code) => (code === 0 ? ok() : falha(new Error(`o ffmpeg falhou (${code}): ${erroFf.trim()}`)))),
  );

  try {
    for (const [i, cena] of cenas.entries()) {
      const page = await abrirCena(browser, cena);
      const total = quadrosDa(cena.segundos);
      for (let q = 0; q < total; q++) await escrever(ff.stdin, await quadro(page, (q * 1000) / FPS));
      if (capa && i + 1 === capaCena) {
        const t = Math.min(await fimDasEntradas(page), cena.segundos * 1000);
        fs.writeFileSync(path.resolve(capa), await quadro(page, t, QUALIDADE_CAPA));
      }
      await page.close();
      console.log(`  ${path.basename(cena.html)}  ${cena.segundos} s  ${total} quadros`);
    }
  } catch (e) {
    ff.stdin.destroy();
    ff.kill("SIGKILL");
    throw e;
  } finally {
    await browser.close();
  }
  ff.stdin.end();
  await fim;

  const bytes = fs.statSync(saida).size;
  const probe = JSON.parse(
    execFileSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", saida], { encoding: "utf8" }),
  );
  const { bloqueios, avisos } = conferirVideo(probe, bytes);
  const duracao = Number(probe.format.duration).toFixed(1);
  console.log(`${path.basename(saida)}  ${LARGURA}x${ALTURA}  ${FPS} fps  ${duracao} s  ${(bytes / 1048576).toFixed(2)} MB`);
  if (capa) {
    const b = fs.statSync(path.resolve(capa)).size;
    console.log(`${path.basename(capa)}  ${LARGURA}x${ALTURA}  JPEG  ${(b / 1048576).toFixed(2)} MB  (cena ${capaCena})`);
    if (b > LIMITE_CAPA_BYTES) bloqueios.push("A capa passou de 8 MB.");
  }
  for (const a of avisos) console.warn(`aviso: ${a}`);
  if (bloqueios.length) throw new Error(`O MP4 não passa na especificação da Meta:\n  ${bloqueios.join("\n  ")}`);
}

const ehPrincipal = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (ehPrincipal) {
  principal(process.argv.slice(2)).catch((e) => {
    console.error(`\n${e.message}\n`);
    process.exit(1);
  });
}
