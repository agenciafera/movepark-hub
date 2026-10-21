// Decisões puras da publicação agendada do Instagram (E3.6). Sem rede e sem banco, para ter teste.
// Ver docs/specs/instagram-fila-de-publicacao.md, seção 3.

/** Post aprovado com mais de 6 h de atraso não sai sozinho: ligar a chave não despeja a fila. */
export const ATRASO_MAXIMO_MS = 6 * 60 * 60 * 1000;
/** `publishing` sem mudança há 15 min é rodada que caiu no meio do caminho. */
export const PUBLICANDO_PARADO_MS = 15 * 60 * 1000;

export interface PostFila {
  id: string;
  status: string;
  scheduled_at: string;
  published_at: string | null;
  updated_at: string;
}

const DIA_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** AAAA-MM-DD no fuso de São Paulo. */
export const diaEmSaoPaulo = (d: Date) => DIA_SP.format(d);

export function atrasados(posts: PostFila[], agora: Date): string[] {
  return posts
    .filter((p) => p.status === "approved" && agora.getTime() - Date.parse(p.scheduled_at) > ATRASO_MAXIMO_MS)
    .map((p) => p.id);
}

export function parados(posts: PostFila[], agora: Date): string[] {
  return posts
    .filter((p) => p.status === "publishing" && agora.getTime() - Date.parse(p.updated_at) > PUBLICANDO_PARADO_MS)
    .map((p) => p.id);
}

export type Escolha = { id: string } | { motivo: "nada" | "ja_publicou_hoje" | "em_andamento" };

export function escolher(posts: PostFila[], agora: Date): Escolha {
  const t = agora.getTime();
  const emAndamento = posts.some(
    (p) => p.status === "publishing" && t - Date.parse(p.updated_at) <= PUBLICANDO_PARADO_MS,
  );
  if (emAndamento) return { motivo: "em_andamento" };

  const candidatos = posts
    .filter((p) => p.status === "approved")
    .filter((p) => {
      const hora = Date.parse(p.scheduled_at);
      return hora <= t && t - hora <= ATRASO_MAXIMO_MS;
    })
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
  if (!candidatos.length) return { motivo: "nada" };

  const hoje = diaEmSaoPaulo(agora);
  const publicouHoje = posts.some(
    (p) => p.status === "published" && p.published_at && diaEmSaoPaulo(new Date(p.published_at)) === hoje,
  );
  if (publicouHoje) return { motivo: "ja_publicou_hoje" };

  return { id: candidatos[0].id };
}

export const jaPublicado = (statusContainer: string) => statusContainer === "PUBLISHED";

export function resumoDoErro(etapa: string, resposta: unknown): string {
  return `${etapa}: ${JSON.stringify(resposta ?? {})}`.slice(0, 500);
}

const LIMITE_ERRO = 500;

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** A mensagem que a Meta (ou o cliente de rede) devolveu, numa linha só. Nunca o JSON cru. */
function mensagemDaMeta(resposta: unknown): string | null {
  const r = objeto(resposta);
  if (!r) return null;
  for (const candidata of [objeto(r.error)?.message, r.erro]) {
    if (typeof candidata === "string" && candidata.trim()) return candidata.replace(/\s+/g, " ").trim();
  }
  return null;
}

/** Monta "prefixo: detalhe. fim" em até 500 caracteres, cortando o detalhe e nunca o fecho. */
function frase(prefixo: string, detalhe: string | null, fim = ""): string {
  const sufixo = fim ? ` ${fim}` : "";
  let corpo = detalhe ? `${prefixo}: ${detalhe}` : prefixo;
  const max = LIMITE_ERRO - sufixo.length - 1;
  if (corpo.length > max) corpo = `${corpo.slice(0, max - 1)}…`;
  if (!/[.!?…]$/.test(corpo)) corpo += ".";
  return corpo + sufixo;
}

/**
 * O texto de `last_error` que o Manager mostra quando `publicar` falha: prefixo em português pela
 * etapa e a mensagem da Meta quando houver. O JSON cru fica no evento, não aqui. A falha do
 * `media_publish` pede para conferir no Instagram, porque a Meta às vezes publica e responde erro.
 */
export function textoDaFalha(etapa: string, resposta: unknown): string {
  const msg = mensagemDaMeta(resposta);
  const slide = /^container do slide (\d+)$/.exec(etapa);
  if (slide) return frase(`Falhou ao enviar o slide ${slide[1]} à Meta`, msg);
  switch (etapa) {
    case "container do carrossel":
      return frase("Falhou ao montar o carrossel na Meta", msg);
    case "container":
      return frase("Falhou ao enviar a imagem à Meta", msg);
    case "sem imagem":
      return "O post não tem imagem para publicar.";
    case "media_publish":
      return frase("Falhou ao publicar na Meta", msg, "Confira no Instagram antes de reagendar.");
    case "container não ficou pronto": {
      const r = objeto(resposta);
      const status = typeof r?.status === "string" ? r.status : "";
      if (status === "TIMEOUT") return frase("A Meta demorou demais para processar as imagens", null);
      const detalhe = typeof r?.detalhe === "string" && r.detalhe.trim() ? r.detalhe.replace(/\s+/g, " ").trim() : null;
      return frase(`A Meta recusou as imagens${status ? ` (${status})` : ""}`, detalhe);
    }
    default:
      return frase(`Falhou na publicação (${etapa})`, msg);
  }
}

/**
 * O instante em que a mídia foi ao ar, no formato da Meta ("2026-10-29T02:55:00+0000"), em ISO.
 * Usado como `published_at` na reconciliação: o dia de São Paulo do post é o de quando ele saiu,
 * não o de quando a rodada o achou. Sem timestamp utilizável, ou à frente do nosso relógio, vale `agora`.
 */
export function instanteDaMeta(timestamp: string | null | undefined, agora: Date): string {
  if (!timestamp) return agora.toISOString();
  const t = Date.parse(timestamp.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(t) || t > agora.getTime()) return agora.toISOString();
  return new Date(t).toISOString();
}
