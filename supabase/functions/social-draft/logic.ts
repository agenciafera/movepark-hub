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
const INICIO_ISO = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * AAAA-MM-DD que existe no calendário. "2026-02-30" passa no formato e o JavaScript empurra para
 * 2 de março, enquanto o Postgres recusa: dar a volta pelo UTC pega os dois casos antes de gravar.
 */
function dataExiste(s: string): boolean {
  if (!DATA.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10) === s;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function lerRascunho(
  bruto: unknown,
): { ok: true; rascunho: Rascunho } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const m = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;

  const origem = texto(m.origem);
  if (!origem || !SLUG.test(origem)) erros.push("A origem é obrigatória e vai em kebab-case, sem acento.");

  let corte: number | null = null;
  if (m.corte !== undefined && m.corte !== null && m.corte !== "") {
    const n = Number(m.corte);
    if (!Number.isInteger(n) || n < 1 || n > 4) erros.push("O corte vai de 1 a 4.");
    else corte = n;
  }

  const publicarEm = texto(m.publicar_em);
  const inicio = publicarEm ? INICIO_ISO.exec(publicarEm) : null;
  if (inicio && !dataExiste(inicio[1])) {
    erros.push("O publicar_em usa uma data que não existe no calendário.");
  } else if (!publicarEm || !inicio || !COM_FUSO.test(publicarEm) || Number.isNaN(Date.parse(publicarEm))) {
    erros.push("O publicar_em precisa ter data e hora com fuso, como 2026-10-28T12:00:00-03:00.");
  }

  const priceDate = texto(m.price_date);
  if (priceDate && !dataExiste(priceDate)) erros.push("O price_date precisa ser uma data real, no formato AAAA-MM-DD.");

  const caption = typeof m.caption === "string" ? m.caption.trim() : "";
  if (!caption) erros.push("A legenda (caption) está vazia.");

  const brutos = Array.isArray(m.slides) ? m.slides : [];
  if (brutos.length < 1 || brutos.length > 10) erros.push("O post precisa de 1 a 10 slides.");
  const slides: SlideRascunho[] = brutos.map((s) => {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    return { arquivo: texto(o.arquivo) ?? "", alt: texto(o.alt), texto: texto(o.texto) };
  });
  slides.forEach((s, i) => {
    if (!ARQUIVO.test(s.arquivo)) erros.push(`Slide ${i + 1}: o arquivo precisa estar em kebab-case e terminar em .jpg.`);
  });
  if (new Set(slides.map((s) => s.arquivo)).size < slides.length) erros.push("Dois slides usam o mesmo arquivo.");

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
/**
 * O corte entra no caminho porque a skill nomeia os arquivos pela palavra-chave e pelo número do
 * slide, e todos os cortes de um blogpost repetem esses nomes. Sem o corte, o rascunho do corte 2
 * (outra `draft_key`, sem 409) sobrescreveria o JPEG do corte 1 já aprovado.
 */
export const caminhoNoBucket = (origem: string, corte: number | null, arquivo: string) =>
  `social/${origem}/${corte ?? 0}/${arquivo}`;

const ROTULOS_STATUS: Record<string, string> = {
  pending_review: "aguardando aprovação",
  approved: "aprovado",
  publishing: "publicando",
  published: "publicado",
  failed: "com falha",
  rejected: "recusado",
  overdue: "atrasado",
};

/** O status do banco é em inglês; o que aparece na tela e nas respostas é em português. */
export const rotuloStatus = (status: string): string => ROTULOS_STATUS[status] ?? "em outro estado";

export const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** A versão na query evita que o CDN sirva a imagem antiga quando o rascunho é reenviado com o mesmo nome. */
export function urlPublica(supabaseUrl: string, caminho: string, versao: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/assets-public/${caminho}?v=${versao}`;
}

export function chaveConfere(esperada: string | undefined, recebida: string | null): boolean {
  return Boolean(esperada) && esperada === recebida;
}
