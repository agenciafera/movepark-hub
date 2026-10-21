// Regras puras da entrada de rascunho do Instagram (E3.6). Sem rede, para ter teste.
// Ver docs/specs/instagram-fila-de-publicacao.md, seção 2.

export interface SlideRascunho {
  arquivo: string;
  alt: string | null;
  texto: string | null;
}

export interface Rascunho {
  origem: string;
  corte: number | null;
  destination: string | null;
  keyphrase: string | null;
  /** ISO em UTC. */
  publicarEm: string;
  ctaUrl: string | null;
  priceDate: string | null;
  caption: string;
  slides: SlideRascunho[];
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARQUIVO = /^[a-z0-9]+(?:-[a-z0-9]+)*\.jpe?g$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const COM_FUSO = /(?:[zZ]|[+-]\d{2}:\d{2})$/;

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function lerRascunho(
  bruto: unknown,
): { ok: true; rascunho: Rascunho } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const m = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;

  const origem = texto(m.origem);
  if (!origem || !SLUG.test(origem)) erros.push("origem obrigatória, em kebab-case sem acento");

  let corte: number | null = null;
  if (m.corte !== undefined && m.corte !== null && m.corte !== "") {
    const n = Number(m.corte);
    if (!Number.isInteger(n) || n < 1 || n > 4) erros.push("corte vai de 1 a 4");
    else corte = n;
  }

  const publicarEm = texto(m.publicar_em);
  if (!publicarEm || !COM_FUSO.test(publicarEm) || Number.isNaN(Date.parse(publicarEm))) {
    erros.push("publicar_em precisa ser data e hora com fuso, ex. 2026-10-28T12:00:00-03:00");
  }

  const priceDate = texto(m.price_date);
  if (priceDate && !DATA.test(priceDate)) erros.push("price_date no formato AAAA-MM-DD");

  const caption = typeof m.caption === "string" ? m.caption.trim() : "";
  if (!caption) erros.push("caption vazia");

  const brutos = Array.isArray(m.slides) ? m.slides : [];
  if (brutos.length < 1 || brutos.length > 10) erros.push("de 1 a 10 slides");
  const slides: SlideRascunho[] = brutos.map((s) => {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    return { arquivo: texto(o.arquivo) ?? "", alt: texto(o.alt), texto: texto(o.texto) };
  });
  slides.forEach((s, i) => {
    if (!ARQUIVO.test(s.arquivo)) erros.push(`slide ${i + 1}: arquivo em kebab-case terminando em .jpg`);
  });
  if (new Set(slides.map((s) => s.arquivo)).size < slides.length) erros.push("dois slides com o mesmo arquivo");

  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    rascunho: {
      origem: origem!,
      corte,
      destination: texto(m.destination),
      keyphrase: texto(m.keyphrase),
      publicarEm: new Date(publicarEm!).toISOString(),
      ctaUrl: texto(m.cta_url),
      priceDate,
      caption,
      slides,
    },
  };
}

export const draftKey = (origem: string, corte: number | null) => `${origem}:${corte ?? 0}`;
export const podeReenviar = (status: string) => status === "pending_review";
export const podeCorrigirLegenda = (status: string) => status === "pending_review" || status === "approved";
export const caminhoNoBucket = (origem: string, arquivo: string) => `social/${origem}/${arquivo}`;

/** A versão na query evita que o CDN sirva a imagem antiga quando o rascunho é reenviado com o mesmo nome. */
export function urlPublica(supabaseUrl: string, caminho: string, versao: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/assets-public/${caminho}?v=${versao}`;
}

export function chaveConfere(esperada: string | undefined, recebida: string | null): boolean {
  return Boolean(esperada) && esperada === recebida;
}
