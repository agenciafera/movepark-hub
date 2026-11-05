#!/usr/bin/env node
/**
 * Monta a trilha de narração de um vídeo de cenas (reel ou YouTube) e a legenda em SRT, a partir
 * de um clipe de voz por cena.
 *
 * Por que existe: quando o vídeo é narrado, a duração de cada cena deixa de ser escolha de
 * diagramação e passa a ser a da fala. Marcar isso à mão (ouvir cada clipe, anotar os segundos,
 * somar os inícios, digitar a legenda com o tempo certo) é o tipo de conta que sai errada e que
 * ninguém confere depois. Aqui o relógio sai dos clipes: cada cena dura o que a fala dela dura,
 * mais uma folga de respiro, e a legenda nasce da mesma linha do tempo. A narração e a cena
 * entram sempre juntas no quadro.
 *
 * Entrada: um JSON com as cenas, na ordem do vídeo:
 *   {
 *     "folga": 1.0,      // segundos de silêncio depois da fala, em toda cena (padrão 1,0)
 *     "minimo": 3,       // duração mínima de uma cena, em segundos (padrão 3)
 *     "ritmo": 1.1,      // acelera a fala em 10% sem mudar o tom (padrão 1, o clipe como veio)
 *     "cenas": [
 *       { "html": "cena-01.html", "audio": "narracao/cena-01.mp3",
 *         "fala": "o texto que foi para a voz, por extenso",
 *         "legenda": "o mesmo texto como se lê, com os números em algarismo" }
 *     ]
 *   }
 *
 * Saída: a trilha (WAV 48 kHz estéreo, com as falas no instante de cada cena e silêncio entre
 * elas, nivelada para -16 LUFS), a legenda SRT (uma ou mais deixas por cena, repartidas pelo
 * tamanho do texto) e, na saída padrão, os argumentos `cena.html:segundos` do render-reel.mjs.
 * A tabela com os tempos vai para a saída de erro, para o stdout poder ir direto no comando.
 *
 * Uso:
 *   node montar-narracao.mjs <cenas.json> --trilha trilha.wav --srt legendas.srt
 *   node render-reel.mjs video.mp4 $(node montar-narracao.mjs cenas.json ...) --audio trilha.wav
 *
 * Requer o ffmpeg e o ffprobe no PATH. Os caminhos do JSON são relativos à pasta dele.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const FOLGA_PADRAO = 1.0;
export const MINIMO_PADRAO = 3;
/** Ritmo da fala: 1 é o clipe como veio; 1,1 acelera 10% (atempo do ffmpeg), sem mudar o tom. */
export const RITMO_PADRAO = 1;
/** Uma deixa de legenda com mais que isso não cabe em duas linhas na tela do YouTube. */
export const MAX_CARACTERES_DEIXA = 84;
export const MAX_CARACTERES_LINHA = 42;

/** Arredonda para cima em décimos, para a cena fechar num décimo redondo. */
export const decimoAcima = (s) => Math.ceil(s * 10 - 1e-9) / 10;

/** Quanto dura uma cena cuja fala dura `audio` segundos. */
export function duracaoDaCena(audio, { folga = FOLGA_PADRAO, minimo = MINIMO_PADRAO } = {}) {
  if (!(audio >= 0)) throw new Error(`duração de áudio inválida: ${audio}`);
  return Math.max(minimo, decimoAcima(audio + folga));
}

/**
 * A linha do tempo: para cada cena, o instante em que ela (e a fala) começa, a duração da cena e
 * a da fala. `cenas` traz `{ html, audio: <segundos> }`.
 */
export function linhaDoTempo(cenas, opcoes = {}) {
  let inicio = 0;
  return cenas.map((c) => {
    const duracao = duracaoDaCena(c.audio, opcoes);
    const item = { html: c.html, inicio: Math.round(inicio * 1000) / 1000, duracao, fala: c.audio };
    inicio += duracao;
    return item;
  });
}

/** Parte um texto em deixas de até MAX_CARACTERES_DEIXA, cortando em pontuação e depois em espaço. */
export function partirEmDeixas(texto, max = MAX_CARACTERES_DEIXA) {
  const limpo = String(texto).replace(/\s+/g, " ").trim();
  if (!limpo) return [];
  // Primeiro por frase, para a deixa nunca atravessar um ponto.
  const frases = limpo.split(/(?<=[.!?])\s+/);
  const deixas = [];
  for (const frase of frases) {
    let resto = frase;
    while (resto.length > max) {
      // Corta no último sinal de pausa antes do limite; sem um, no último espaço.
      const trecho = resto.slice(0, max + 1);
      let corte = Math.max(trecho.lastIndexOf(", "), trecho.lastIndexOf(": "), trecho.lastIndexOf("; "));
      if (corte > max * 0.4) corte += 1;
      else corte = trecho.lastIndexOf(" ");
      if (corte <= 0) corte = max;
      deixas.push(resto.slice(0, corte).trim());
      resto = resto.slice(corte).trim();
    }
    if (resto) deixas.push(resto);
  }
  return deixas;
}

/** Quebra uma deixa em até duas linhas, no espaço mais perto do meio. */
export function quebrarLinhas(deixa, max = MAX_CARACTERES_LINHA) {
  if (deixa.length <= max) return deixa;
  const meio = Math.floor(deixa.length / 2);
  let corte = -1;
  for (let d = 0; d <= meio; d++) {
    if (deixa[meio - d] === " ") { corte = meio - d; break; }
    if (deixa[meio + d] === " ") { corte = meio + d; break; }
  }
  if (corte <= 0) return deixa;
  return `${deixa.slice(0, corte)}\n${deixa.slice(corte + 1)}`;
}

/**
 * As deixas da legenda de todas as cenas, com início e fim. Dentro de uma cena, o tempo da fala é
 * repartido entre as deixas na proporção do tamanho de cada uma.
 */
export function deixasDaLegenda(linha, legendas) {
  const deixas = [];
  linha.forEach((cena, i) => {
    const partes = partirEmDeixas(legendas[i] ?? "");
    if (!partes.length) return;
    const total = partes.reduce((s, p) => s + p.length, 0);
    let t = cena.inicio;
    for (const parte of partes) {
      const dur = (cena.fala * parte.length) / total;
      deixas.push({ inicio: t, fim: t + dur, texto: quebrarLinhas(parte) });
      t += dur;
    }
  });
  return deixas;
}

export function tempoSrt(segundos) {
  const ms = Math.round(segundos * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, w) => String(n).padStart(w, "0");
  return `${p(h, 2)}:${p(m, 2)}:${p(s, 2)},${p(r, 3)}`;
}

export function srt(deixas) {
  return deixas
    .map((d, i) => `${i + 1}\n${tempoSrt(d.inicio)} --> ${tempoSrt(d.fim)}\n${d.texto}\n`)
    .join("\n");
}

/** Os argumentos `cena.html:segundos` na ordem do vídeo. */
export const argsDoRender = (linha) => linha.map((c) => `${c.html}:${c.duracao}`).join(" ");

/**
 * Os argumentos do ffmpeg que põem cada clipe no instante da sua cena, somam tudo, nivelam o
 * volume e completam com silêncio até o fim do vídeo. Entrada: os clipes (caminhos) e a linha do
 * tempo; saída: WAV 48 kHz estéreo.
 */
export function argsDoFfmpeg(clipes, linha, saida, ritmo = RITMO_PADRAO) {
  const total = linha.reduce((s, c) => s + c.duracao, 0);
  const entradas = clipes.flatMap((c) => ["-i", c]);
  const atrasos = linha
    .map((c, i) => {
      const ms = Math.round(c.inicio * 1000);
      const tempo = ritmo === 1 ? "" : `atempo=${ritmo},`;
      return `[${i}:a]${tempo}aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`;
    })
    .join(";");
  const rotulos = linha.map((_, i) => `[a${i}]`).join("");
  const mistura = `${rotulos}amix=inputs=${linha.length}:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,apad=whole_dur=${total}[out]`;
  return [
    "-y", "-loglevel", "error",
    ...entradas,
    "-filter_complex", `${atrasos};${mistura}`,
    "-map", "[out]", "-t", String(total),
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
    saida,
  ];
}

// ------------------------------------------------------------------- execução

function duracaoDoClipe(arquivo) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arquivo], {
    encoding: "utf8",
  });
  const s = Number(out.trim());
  if (!(s > 0)) throw new Error(`não li a duração de ${arquivo}`);
  return s;
}

function principal(argv) {
  let json = null;
  let trilha = null;
  let legenda = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--trilha") trilha = argv[++i];
    else if (argv[i] === "--srt") legenda = argv[++i];
    else if (argv[i].startsWith("--")) throw new Error(`opção desconhecida: ${argv[i]}`);
    else if (!json) json = argv[i];
    else throw new Error(`argumento a mais: ${argv[i]}`);
  }
  if (!json || !trilha || !legenda) throw new Error("uso: montar-narracao.mjs <cenas.json> --trilha trilha.wav --srt legendas.srt");

  const base = path.dirname(path.resolve(json));
  const conf = JSON.parse(fs.readFileSync(json, "utf8"));
  if (!Array.isArray(conf.cenas) || !conf.cenas.length) throw new Error(`${json}: sem cenas.`);
  const opcoes = { folga: conf.folga ?? FOLGA_PADRAO, minimo: conf.minimo ?? MINIMO_PADRAO };
  const ritmo = conf.ritmo ?? RITMO_PADRAO;
  if (!(ritmo >= 0.5 && ritmo <= 2)) throw new Error(`${json}: ritmo ${ritmo} fora de 0,5 a 2.`);

  const clipes = [];
  const medidas = conf.cenas.map((c, i) => {
    for (const campo of ["html", "audio", "legenda"]) {
      if (!c[campo]) throw new Error(`cena ${i + 1}: falta "${campo}".`);
    }
    const clipe = path.resolve(base, c.audio);
    if (!fs.existsSync(clipe)) throw new Error(`cena ${i + 1}: não achei o clipe ${clipe}`);
    if (!fs.existsSync(path.resolve(base, c.html))) throw new Error(`cena ${i + 1}: não achei a cena ${c.html}`);
    clipes.push(clipe);
    return { html: c.html, audio: duracaoDoClipe(clipe) / ritmo };
  });

  const linha = linhaDoTempo(medidas, opcoes);
  const deixas = deixasDaLegenda(linha, conf.cenas.map((c) => c.legenda));
  fs.writeFileSync(path.resolve(legenda), srt(deixas));
  execFileSync("ffmpeg", argsDoFfmpeg(clipes, linha, path.resolve(trilha), ritmo), { stdio: ["ignore", "ignore", "inherit"] });

  const total = linha.reduce((s, c) => s + c.duracao, 0);
  for (const c of linha) {
    console.error(`  ${c.html}  começa em ${c.inicio.toFixed(1).padStart(5)} s  fala ${c.fala.toFixed(1)} s  cena ${c.duracao.toFixed(1)} s`);
  }
  console.error(`${path.basename(trilha)}  ${total.toFixed(1)} s  |  ${path.basename(legenda)}  ${deixas.length} deixas`);
  console.log(argsDoRender(linha));
}

const ehPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ehPrincipal) {
  try {
    principal(process.argv.slice(2));
  } catch (e) {
    console.error(`\n${e.message}\n`);
    process.exit(1);
  }
}
