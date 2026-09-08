// Validação pura do payload de publicação no Instagram, separada do HTTP para
// ter teste. Os limites são os da API da Meta, não preferência nossa: a lista
// está em .claude/skills/instagram/references/api-instagram.md.
//
// Vale a pena validar aqui em vez de deixar a Meta recusar porque o carrossel
// cria N containers antes do publish: falhar no sétimo deixa seis containers
// órfãos pendurados na conta por 24h.

export const LIMITES = {
  legenda: 2200,
  hashtags: 30,
  mencoes: 20,
  slides: 10,
  alt: 1000,
} as const;

export interface Imagem {
  url: string;
  alt?: string;
}

export interface Payload {
  caption: string;
  images: Imagem[];
}

/** Devolve a lista de problemas. Vazia significa que o payload passa. */
export function validar(p: Partial<Payload>): string[] {
  const erros: string[] = [];
  const caption = typeof p.caption === "string" ? p.caption : "";
  const images = Array.isArray(p.images) ? p.images : [];

  if (!caption.trim()) erros.push("caption vazia");
  if (caption.length > LIMITES.legenda) {
    erros.push(`caption tem ${caption.length} caracteres, o limite é ${LIMITES.legenda}`);
  }

  const hashtags = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (hashtags.length > LIMITES.hashtags) {
    erros.push(`${hashtags.length} hashtags, o limite é ${LIMITES.hashtags}`);
  }

  const mencoes = caption.match(/@[A-Za-z0-9._]+/g) ?? [];
  if (mencoes.length > LIMITES.mencoes) {
    erros.push(`${mencoes.length} menções, o limite é ${LIMITES.mencoes}`);
  }

  if (images.length === 0) erros.push("nenhuma imagem");
  if (images.length > LIMITES.slides) {
    erros.push(`${images.length} slides, o limite do carrossel é ${LIMITES.slides}`);
  }

  images.forEach((img, i) => {
    const n = i + 1;
    if (!img?.url) {
      erros.push(`imagem ${n} sem url`);
      return;
    }
    if (!/^https:\/\//i.test(img.url)) {
      erros.push(`imagem ${n} não é https, e a Meta só busca por https`);
    }
    if (!/\.jpe?g(\?|$)/i.test(img.url)) {
      erros.push(`imagem ${n} não termina em .jpg, e a API só aceita JPEG`);
    }
    if (img.alt && img.alt.length > LIMITES.alt) {
      erros.push(`alt da imagem ${n} tem ${img.alt.length} caracteres, o limite é ${LIMITES.alt}`);
    }
  });

  return erros;
}

/** Carrossel a partir de 2 imagens; 1 imagem é post único. */
export function ehCarrossel(images: unknown[]): boolean {
  return images.length > 1;
}

/** Confere a chave do header sem vazar qual dos dois lados faltou. */
export function autorizado(esperada: string | undefined, recebida: string | null): boolean {
  return Boolean(esperada) && esperada === recebida;
}
