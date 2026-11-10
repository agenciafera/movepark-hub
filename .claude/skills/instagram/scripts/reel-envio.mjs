/**
 * O reel na fila do Instagram (10/11/2026): as peças puras do envio, separadas do
 * enviar-rascunho.mjs para ter teste sem ffmpeg nem rede.
 *
 * O MP4 não passa pela Edge: o script pede uma URL assinada (`video_upload_url`), sobe o arquivo
 * direto para o bucket `social-video` e só então manda o rascunho, com a capa anexada e o que o
 * ffprobe mediu. Ver docs/specs/instagram-fila-de-publicacao.md, decisão 11.
 */

import crypto from "node:crypto";

/**
 * Remux sem recodificar: põe o `moov` no início e tira a edit list, as duas exigências da Meta que
 * o vídeo editado fora do render-reel nem sempre cumpre. Imagem e som saem idênticos.
 */
export function argsDoRemux(entrada, saida) {
  return [
    "-y", "-loglevel", "error", "-i", entrada,
    "-map", "0", "-c", "copy", "-movflags", "+faststart", "-use_editlist", "0",
    saida,
  ];
}

/** Os 16 primeiros caracteres hex do SHA-256: o endereço do vídeo no bucket, como o das imagens. */
export const hashDoVideo = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);

/** O que a Edge lê do vídeo, a partir do JSON do ffprobe. */
export function videoDoProbe(probe, { arquivo, hash, bytes }) {
  const video = probe.streams?.find((s) => s.codec_type === "video");
  const audio = probe.streams?.find((s) => s.codec_type === "audio");
  const [n, d] = String(video?.avg_frame_rate ?? video?.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    arquivo,
    hash,
    bytes,
    duracao_s: Number(Number(probe.format?.duration ?? video?.duration ?? 0).toFixed(3)),
    largura: video?.width ?? 0,
    altura: video?.height ?? 0,
    fps: d ? Number((n / d).toFixed(3)) : 0,
    codec: video?.codec_name ?? "",
    audio: audio?.codec_name ?? null,
  };
}

/**
 * Os nomes que o rascunho do reel precisa trazer, com o problema de cada um. A Edge exige
 * kebab-case: o nome é sinal de busca, como o dos slides.
 */
export function errosDoReel(meta) {
  const erros = [];
  const video = String(meta.video ?? "");
  const capa = String(meta.capa ?? "");
  if (!video) erros.push("Reel sem `video` no front matter.");
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.mp4$/.test(video)) {
    erros.push(`\`${video}\`: o vídeo vai em kebab-case, sem acento, e em .mp4.`);
  }
  if (!capa) erros.push("Reel sem `capa` no front matter. A fila exige a capa (JPEG 9:16), que é o que aparece na grade.");
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.jpe?g$/.test(capa)) {
    erros.push(`\`${capa}\`: a capa vai em kebab-case, sem acento, e em .jpg.`);
  }
  const onde = meta.onde === undefined ? ["feed"] : [meta.onde].flat().map((l) => String(l).trim());
  if (onde.join() !== "feed") erros.push("O reel sai só no feed (e na aba de reels). Tire o `onde` ou deixe `onde: [feed]`.");
  return erros;
}
