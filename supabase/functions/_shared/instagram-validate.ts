// Conferência do post do Instagram no servidor (E3.6).
//
// A skill roda o analisador completo antes de enviar. Aqui o servidor repete só o que quebra a
// publicação na Meta ou a marca, porque é o que não pode depender de alguém ter rodado o script.
// Os limites são da API (.claude/skills/instagram/references/api-instagram.md); as regras de
// marca são as do CLAUDE.md e do ADR-009. Ver docs/specs/instagram-fila-de-publicacao.md, seção 2.

export const LIMITES = {
  legenda: 2200,
  hashtags: 30,
  mencoes: 20,
  /** A API aceita 20 no carrossel desde 2026; a skill fixa 10. */
  slides: 10,
  alt: 1000,
  bytes: 8 * 1024 * 1024,
  larguraMin: 320,
  larguraMax: 1440,
} as const;

/** Largura sobre altura: de 4:5 (0,8) a 1,91:1, com folga de arredondamento. */
const PROPORCAO_MIN = 0.8 - 0.005;
const PROPORCAO_MAX = 1.91 + 0.005;

export interface SlideTexto {
  alt?: string | null;
  texto?: string | null;
}

export interface PostTexto {
  caption: string;
  slides: SlideTexto[];
  keyphrase?: string | null;
  /** AAAA-MM-DD: a data em que os preços do post foram conferidos. */
  priceDate?: string | null;
  hoje?: Date;
}

export interface Conferencia {
  blockers: string[];
  warnings: string[];
}

/** Promessa de transação (ADR-009): a mesma lista do recorte arquivado do Diego, mais o "cancelar gratuitamente" do post de 26/08. */
const PROMESSAS: { termo: RegExp; rotulo: string }[] = [
  { termo: /vagas?\s+garantidas?/i, rotulo: "vaga garantida" },
  { termo: /cancel(ar|amento)\s+(gr[áa]tis|gratuit[oa]|gratuitamente|sem\s+custo)/i, rotulo: "cancelamento grátis" },
  { termo: /pre[çc]o\s+fixo/i, rotulo: "preço fixo" },
  { termo: /(melhor|menor)\s+pre[çc]o\s+garantido/i, rotulo: "melhor preço garantido" },
  { termo: /reserva\s+garantida/i, rotulo: "reserva garantida" },
  { termo: /satisfa[çc][ãa]o\s+garantida/i, rotulo: "satisfação garantida" },
];

/** Diferencia maiúscula de propósito: "movepark" em hashtag e domínio é normal. */
const MARCA_ERRADA = /\bMove\s?Park\b|\bMOVE\s?PARK\b/;

const normaliza = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function hashtagsDe(caption: string): string[] {
  return caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
}

/** Data AAAA-MM-DD que existe de verdade. Devolve null para "20/10/2026", "x" e "2026-02-30". */
function dataValida(s: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== s) return null;
  return s;
}

export function conferirTexto(p: PostTexto): Conferencia {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const caption = typeof p.caption === "string" ? p.caption : "";
  const slides = Array.isArray(p.slides) ? p.slides : [];

  if (!caption.trim()) blockers.push("A legenda está vazia.");
  if (caption.length > LIMITES.legenda) {
    blockers.push(`A legenda tem ${caption.length} caracteres. O Instagram aceita até ${LIMITES.legenda}.`);
  }

  const hashtags = hashtagsDe(caption);
  const nHashtags = `${hashtags.length} ${hashtags.length === 1 ? "hashtag" : "hashtags"}`;
  if (hashtags.length > LIMITES.hashtags) {
    blockers.push(`A legenda tem ${nHashtags}. O Instagram aceita até ${LIMITES.hashtags}.`);
  } else if (hashtags.length < 3 || hashtags.length > 5) {
    warnings.push(`A legenda tem ${nHashtags}. O ideal é de 3 a 5.`);
  }

  const mencoes = caption.match(/@[A-Za-z0-9._]+/g) ?? [];
  if (mencoes.length > LIMITES.mencoes) {
    blockers.push(`A legenda tem ${mencoes.length} menções. O Instagram aceita até ${LIMITES.mencoes}.`);
  }

  if (slides.length === 0) blockers.push("O post não tem imagem.");
  if (slides.length > LIMITES.slides) {
    blockers.push(`O carrossel tem ${slides.length} slides. O máximo é ${LIMITES.slides}.`);
  }

  const textos: { onde: string; texto: string }[] = [{ onde: "na legenda", texto: caption }];
  slides.forEach((s, i) => {
    const n = i + 1;
    const alt = (s?.alt ?? "").trim();
    if (!alt) warnings.push(`O slide ${n} está sem texto alternativo.`);
    if (alt.length > LIMITES.alt) {
      blockers.push(`O texto alternativo do slide ${n} tem ${alt.length} caracteres. O limite é ${LIMITES.alt}.`);
    }
    if (alt) textos.push({ onde: `no texto alternativo do slide ${n}`, texto: alt });
    const t = (s?.texto ?? "").trim();
    if (t) textos.push({ onde: `no texto do slide ${n}`, texto: t });
  });

  const alts = slides.map((s) => normaliza(s?.alt ?? "")).filter(Boolean);
  if (new Set(alts).size < alts.length) warnings.push("Há texto alternativo repetido entre slides.");

  for (const { onde, texto } of textos) {
    if (/[\u2014\u2013]/.test(texto)) {
      blockers.push(`Travessão ${onde}. Troque por ponto, vírgula, dois-pontos ou " - ".`);
    }
    for (const { termo, rotulo } of PROMESSAS) {
      if (termo.test(texto)) {
        blockers.push(`Promessa de transação ${onde}: "${rotulo}". Tire essa frase do texto (ADR-009).`);
      }
    }
    if (MARCA_ERRADA.test(texto)) blockers.push(`Marca grafada errada ${onde}. O certo é "Movepark".`);
  }

  const temPreco = textos.some(({ texto }) => /R\$\s?\d/.test(texto));
  // Data malformada conta como ausente: "20/10/2026" não pode passar por data de referência.
  const dataPreco = p.priceDate ? dataValida(p.priceDate) : null;
  if (temPreco && !dataPreco) {
    blockers.push("O post cita preço em R$, mas não tem a data em que o preço foi conferido (campo price_date).");
  }
  if (dataPreco) {
    // Dias civis em -03:00: preço conferido hoje de manhã não pode virar "no futuro".
    const hojeBR = new Date((p.hoje ?? new Date()).getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
    const dias = Math.round((Date.parse(`${hojeBR}T00:00:00Z`) - Date.parse(`${dataPreco}T00:00:00Z`)) / 86_400_000);
    if (dias < 0) warnings.push("A data em que o preço foi conferido está no futuro. Confira a data.");
    else if (dias > 30) warnings.push(`O preço foi conferido há ${dias} dias.`);
  }

  if (p.keyphrase && !normaliza(caption.slice(0, 125)).includes(normaliza(p.keyphrase))) {
    warnings.push("A frase-chave não aparece nos primeiros 125 caracteres da legenda.");
  }

  return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)] };
}

export interface ImagemInfo {
  jpeg: boolean;
  largura: number;
  altura: number;
  bytes: number;
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Lê largura e altura do primeiro SOF. Não decodifica a imagem: só anda pelos marcadores. */
export function lerJpeg(b: Uint8Array): ImagemInfo {
  const nada = { jpeg: false, largura: 0, altura: 0, bytes: b.length };
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return nada;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return nada;
    const marcador = b[i + 1];
    if (marcador === 0xff) {
      i += 1;
      continue;
    }
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd8)) {
      i += 2;
      continue;
    }
    const tamanho = (b[i + 2] << 8) | b[i + 3];
    if (SOF.has(marcador)) {
      if (i + 8 >= b.length) return nada;
      return {
        jpeg: true,
        altura: (b[i + 5] << 8) | b[i + 6],
        largura: (b[i + 7] << 8) | b[i + 8],
        bytes: b.length,
      };
    }
    i += 2 + tamanho;
  }
  return nada;
}

/** Problemas que a Meta recusaria na hora de publicar. Lista vazia: a imagem passa. */
export function conferirImagem(info: ImagemInfo, nome: string): string[] {
  if (!info.jpeg) return [`${nome} não é JPEG. O Instagram só aceita JPEG.`];
  const erros: string[] = [];
  if (info.largura < LIMITES.larguraMin || info.largura > LIMITES.larguraMax) {
    erros.push(`${nome} tem ${info.largura} px de largura. O Instagram aceita de ${LIMITES.larguraMin} a ${LIMITES.larguraMax}.`);
  }
  const proporcao = info.altura ? info.largura / info.altura : 0;
  if (proporcao < PROPORCAO_MIN || proporcao > PROPORCAO_MAX) {
    erros.push(`${nome} está em ${info.largura}x${info.altura}. A proporção aceita vai de 4:5 a 1,91:1.`);
  }
  if (info.bytes > LIMITES.bytes) {
    erros.push(`${nome} tem ${(info.bytes / 1048576).toFixed(1)} MB. O limite é 8 MB.`);
  }
  return erros;
}

/** Story: 9:16 (largura sobre altura 0,5625), com folga de arredondamento. */
const PROPORCAO_STORY = 9 / 16;

/**
 * A imagem de um story: JPEG, vertical 9:16 e até 8 MB. A Meta recomenda 9:16 para não cortar
 * nem sobrar faixa vazia; a skill gera 1080x1920 a partir do slide (render-story.mjs).
 */
export function conferirStory(info: ImagemInfo, nome: string): string[] {
  if (!info.jpeg) return [`${nome} não é JPEG. O Instagram só aceita JPEG.`];
  const erros: string[] = [];
  if (info.largura < LIMITES.larguraMin || info.largura > LIMITES.larguraMax) {
    erros.push(`${nome} tem ${info.largura} px de largura. O Instagram aceita de ${LIMITES.larguraMin} a ${LIMITES.larguraMax}.`);
  }
  const proporcao = info.altura ? info.largura / info.altura : 0;
  if (Math.abs(proporcao - PROPORCAO_STORY) > 0.01) {
    erros.push(`${nome} está em ${info.largura}x${info.altura}. O story precisa ser vertical 9:16, como 1080x1920.`);
  }
  if (info.bytes > LIMITES.bytes) {
    erros.push(`${nome} tem ${(info.bytes / 1048576).toFixed(1)} MB. O limite é 8 MB.`);
  }
  return erros;
}
