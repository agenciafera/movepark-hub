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
/**
 * Reenvio do mesmo rascunho: vale enquanto ele espera aprovação, e também depois de recusado, desde
 * que a Meta nunca tenha recebido nada dele (`ig_container_id` nulo). É o caminho de "recusar e
 * mandar de novo" da skill. Recusado com container já teve tentativa de publicação, e voltar para a
 * fila com um envio antigo pendurado na Meta arriscaria publicar duas vezes.
 */
export const podeReenviar = (status: string, igContainerId: string | null = null) =>
  status === "pending_review" || (status === "rejected" && !igContainerId);

/** Texto do 409 quando o reenvio não é aceito. O status do banco nunca aparece em inglês. */
export const motivoDoReenvioRecusado = (status: string): string =>
  status === "rejected"
    ? "Este rascunho foi recusado depois de uma tentativa de publicação na Meta e não pode ser reenviado. Use outro corte ou outra origem."
    : `Este rascunho já está ${rotuloStatus(status)} e não pode ser substituído por um reenvio.`;

/** A versão que a pessoa abriu precisa ser um instante válido, senão o filtro do banco estoura. */
export const versaoValida = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && !Number.isNaN(Date.parse(v));

/** Texto do 409 de versão velha: o mesmo da RPC `social_post_approve`. */
export const TEXTO_VERSAO_VELHA = "O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova.";
export const podeCorrigirLegenda = (status: string) => status === "pending_review" || status === "approved";
/**
 * O caminho é endereçado pelo conteúdo: `social/<origem>/<corte>/<hash>/<arquivo>`.
 *
 * Dois motivos. O corte entra porque a skill nomeia os arquivos pela palavra-chave e pelo número do
 * slide, e todos os cortes do mesmo blogpost repetem esses nomes. O hash entra porque o bucket
 * serve o que estiver no caminho na hora em que a Meta busca a imagem (a query `?v=` é ignorada):
 * se bytes diferentes pudessem ocupar o mesmo caminho, um reenvio trocaria a imagem de um post já
 * aprovado. Com o hash, bytes diferentes caem em caminhos diferentes e o objeto nunca muda.
 */
export const caminhoNoBucket = (origem: string, corte: number | null, hash: string, arquivo: string) =>
  `social/${origem}/${corte ?? 0}/${hash}/${arquivo}`;

/** Upload com `upsert: false` recusa caminho ocupado. Mesmo caminho é mesmo conteúdo, então vale como sucesso. */
export function objetoJaExiste(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const e = erro as { statusCode?: unknown; status?: unknown; message?: unknown };
  return (
    String(e.statusCode) === "409" ||
    String(e.status) === "409" ||
    (typeof e.message === "string" && /already exists|duplicate/i.test(e.message))
  );
}

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

/** O caminho já carrega o hash do conteúdo, então a URL não precisa de versão na query. */
export function urlPublica(supabaseUrl: string, caminho: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/assets-public/${caminho}`;
}

export function chaveConfere(esperada: string | undefined, recebida: string | null): boolean {
  return Boolean(esperada) && esperada === recebida;
}
