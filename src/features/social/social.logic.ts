import type { SocialPost, SocialPostPlacement, SocialPostStatus } from "@/types/domain";

/**
 * Regras da tela da fila do Instagram (E3.6). O servidor é quem decide (RPC e Edge); aqui é só
 * o espelho, para a tela não oferecer o que o servidor vai recusar.
 *
 * Spec: docs/specs/instagram-fila-de-publicacao.md
 */

export type SocialAba = "para-aprovar" | "agendados" | "publicados" | "falhas";

export const ABAS: { id: SocialAba; rotulo: string }[] = [
  { id: "para-aprovar", rotulo: "Para aprovar" },
  { id: "agendados", rotulo: "Agendados" },
  { id: "publicados", rotulo: "Publicados" },
  { id: "falhas", rotulo: "Falhas" },
];

/** O atrasado volta para "Para aprovar" porque precisa de uma decisão: nova data. O recusado some. */
export function abaDoStatus(s: SocialPostStatus): SocialAba | null {
  switch (s) {
    case "pending_review":
    case "overdue":
      return "para-aprovar";
    case "approved":
    case "publishing":
      return "agendados";
    case "published":
      return "publicados";
    case "failed":
      return "falhas";
    default:
      return null;
  }
}

export const ROTULO_STATUS: Record<SocialPostStatus, string> = {
  pending_review: "Para aprovar",
  approved: "Agendado",
  publishing: "Publicando",
  published: "Publicado",
  failed: "Falhou",
  rejected: "Recusado",
  overdue: "Atrasado",
};

export const TOM_STATUS: Record<
  SocialPostStatus,
  "pending" | "confirmed" | "active" | "completed" | "cancelled" | "neutral" | "noshow"
> = {
  pending_review: "pending",
  approved: "confirmed",
  publishing: "active",
  published: "completed",
  failed: "cancelled",
  rejected: "neutral",
  overdue: "noshow",
};

/**
 * Os rótulos do rastro. Os de chamada à Meta descrevem o PEDIDO, e não o resultado: a mesma linha
 * serve para o sucesso e para o HTTP 500, e o resultado já aparece ao lado (`HTTP 500`). Um rótulo
 * como "Publicado na Meta" sobre uma resposta de erro afirmaria o que não aconteceu.
 */
export const ROTULO_EVENTO: Record<string, string> = {
  draft_received: "Rascunho recebido",
  caption_edited: "Legenda corrigida",
  approved: "Aprovado",
  rejected: "Recusado",
  rescheduled: "Reagendado",
  dry_run: "Simulação: publicaria agora (publicação automática desligada)",
  container_child: "Envio do slide à Meta",
  container_parent: "Envio do post à Meta",
  container_status: "Consulta da situação do envio",
  media_publish: "Pedido de publicação à Meta",
  permalink: "Leitura do link do post",
  consulta: "Consulta à Meta",
  reconciled: "Conferido: já estava publicado",
  overdue: "Atrasado",
  failed: "Falhou",
  publish_now: "Publicar agora pedido",
  story_container: "Envio do story à Meta",
  story_publish: "Pedido de publicação do story à Meta",
  story_published: "Stories publicados",
  story_failed: "Stories falharam",
  placements_edited: "Lugares alterados",
};

/** Estados em que a data ainda pode mudar. Em `failed`, reagendar é o "tentar de novo". */
export const REAGENDAVEIS: SocialPostStatus[] = ["pending_review", "approved", "overdue", "failed"];

/**
 * "Publicar agora" (21/10/2026): os estados que a RPC `social_post_publish_now` aceita. Com
 * bloqueio da conferência o botão some, porque o servidor recusa em qualquer estado.
 */
export const PUBLICAVEIS_AGORA: SocialPostStatus[] = [
  "pending_review",
  "approved",
  "overdue",
  "failed",
];

export function podePublicarAgora(p: Pick<SocialPost, "status" | "validation">): boolean {
  return PUBLICAVEIS_AGORA.includes(p.status) && p.validation.blockers.length === 0;
}

const DIA_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Outro post da fila já saiu hoje, no fuso de São Paulo? O "Publicar agora" ignora o um por dia
 * (decisão do Kallef), mas a confirmação avisa, porque os dois posts disputam alcance.
 */
export function jaSaiuPostHoje(
  fila: Pick<SocialPost, "id" | "published_at">[] | undefined,
  postId: string,
  agora: Date,
): boolean {
  const hoje = DIA_SP.format(agora);
  return (fila ?? []).some(
    (p) => p.id !== postId && p.published_at && DIA_SP.format(new Date(p.published_at)) === hoje,
  );
}

/** O texto da confirmação do "Publicar agora". */
export function perguntaDePublicarAgora(
  fila: Pick<SocialPost, "id" | "published_at">[] | undefined,
  postId: string,
  agora: Date,
): string {
  const pergunta =
    "Publicar agora no Instagram? O post vai ao ar em seguida na conta @moveparkestacionamento.";
  return jaSaiuPostHoje(fila, postId, agora)
    ? `${pergunta} Já saiu um post hoje, e os dois vão disputar alcance.`
    : pergunta;
}

/** O Instagram mostra cerca de 125 caracteres antes do "mais". */
export const LIMITE_GANCHO = 125;

export function partirGancho(caption: string): { gancho: string; resto: string } {
  return { gancho: caption.slice(0, LIMITE_GANCHO), resto: caption.slice(LIMITE_GANCHO) };
}

export function podeAprovar(
  p: Pick<SocialPost, "status" | "validation" | "scheduled_at">,
  agora: Date,
): { ok: true } | { ok: false; motivo: string } {
  if (p.status !== "pending_review")
    return { ok: false, motivo: "Só post aguardando aprovação pode ser aprovado." };
  if (p.validation.blockers.length)
    return { ok: false, motivo: "Resolva os bloqueios antes de aprovar." };
  if (Date.parse(p.scheduled_at) <= agora.getTime()) {
    return { ok: false, motivo: "A data já passou. Reagende antes de aprovar." };
  }
  return { ok: true };
}

/** O Brasil não tem horário de verão desde 2019, então São Paulo é sempre -03:00. */
const TRES_HORAS = 3 * 60 * 60 * 1000;

/** ISO do banco para o valor de um `<input type="datetime-local">` na hora de São Paulo. */
export function paraCampoDeData(iso: string): string {
  return new Date(Date.parse(iso) - TRES_HORAS).toISOString().slice(0, 16);
}

/** Valor do `<input type="datetime-local">`, lido como hora de São Paulo, para ISO em UTC. */
export function deCampoDeData(valor: string): string {
  return new Date(`${valor}:00-03:00`).toISOString();
}

/**
 * A data que o campo traz de início. Se a data do post ainda está no futuro, é ela. Se já passou
 * (post `failed`, `overdue` ou aprovado e esquecido), reagendar para ela seria recusado pelo
 * servidor, então a sugestão é amanhã ao meio-dia, hora de São Paulo.
 */
export function sugestaoDeData(scheduledAt: string, agora: Date): string {
  if (Date.parse(scheduledAt) > agora.getTime()) return paraCampoDeData(scheduledAt);
  const amanha = new Date(agora.getTime() - TRES_HORAS);
  amanha.setUTCDate(amanha.getUTCDate() + 1);
  return `${amanha.toISOString().slice(0, 10)}T12:00`;
}

/** O valor do campo é uma data válida e está depois de `agora`? Campo vazio ou incompleto: não. */
export function dataNoFuturo(valor: string, agora: Date): boolean {
  if (!valor) return false;
  const t = Date.parse(`${valor}:00-03:00`);
  return Number.isFinite(t) && t > agora.getTime();
}

const QUANDO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export function formatarQuando(iso: string): string {
  return QUANDO.format(new Date(iso));
}

/** AAAA-MM-DD para DD/MM/AAAA, sem passar por Date (que mudaria o dia pelo fuso). */
export function formatarDia(aaaaMmDd: string): string {
  return `${aaaaMmDd.slice(8, 10)}/${aaaaMmDd.slice(5, 7)}/${aaaaMmDd.slice(0, 4)}`;
}

/**
 * O texto de um erro para mostrar na tela. Erro de RPC chega como `PostgrestError` (um objeto
 * simples, não `Error`) com o texto do `raise exception` do servidor, em pt-BR, em `message`.
 * Por isso vale qualquer valor com `message` em texto, e não só `instanceof Error`; sem isso,
 * cai no `padrao`.
 */
export function mensagemDoErro(e: unknown, padrao = "Não deu certo. Tente de novo."): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return padrao;
}

// ── Stories (22/10/2026) ─────────────────────────────────────────────────────────────

/** Onde o post sai, numa frase curta. */
export function rotuloDosLugares(placements: SocialPostPlacement[]): string {
  const feed = placements.includes("feed");
  const story = placements.includes("story");
  if (feed && story) return "Feed e stories";
  return story ? "Só nos stories" : "Só no feed";
}

/** Os estados em que dá para mudar onde o post sai: os mesmos do reagendar. */
export const LUGARES_EDITAVEIS = REAGENDAVEIS;

type PostDeStories = Pick<
  SocialPost,
  "status" | "placements" | "story_status" | "story_error" | "story_published_at"
>;

/**
 * Post que já saiu no feed e tem stories pendentes ou com falha: o botão publica só os stories.
 * A RPC `social_post_publish_now` aceita exatamente estes casos.
 */
export function podePublicarStoriesAgora(p: Pick<PostDeStories, "status" | "placements" | "story_status">): boolean {
  return (
    p.status === "published" &&
    p.placements.includes("story") &&
    (p.story_status === "pending" || p.story_status === "failed")
  );
}

/** Em que pé estão os stories. Nulo quando o post não vai para stories. */
export function situacaoDosStories(p: PostDeStories): string | null {
  if (!p.placements.includes("story") || !p.story_status) return null;
  switch (p.story_status) {
    case "published":
      return p.story_published_at
        ? `Stories publicados em ${formatarQuando(p.story_published_at)}.`
        : "Stories publicados.";
    case "publishing":
      return "Publicando os stories…";
    case "failed":
      return `Os stories falharam: ${p.story_error ?? "sem detalhe"}`;
    case "pending":
      if (p.status === "published") {
        return "Os stories ainda não saíram. Saem na próxima rodada com a publicação automática ligada, ou pelo botão abaixo.";
      }
      return p.placements.includes("feed")
        ? "Os stories saem logo depois do feed."
        : "Os stories saem na hora marcada.";
  }
}

/** A confirmação do "Publicar stories agora". */
export function perguntaDePublicarStories(n: number): string {
  return n === 1
    ? "Publicar agora o story no Instagram? Ele fica 24 horas no ar."
    : `Publicar agora os ${n} stories no Instagram? Eles ficam 24 horas no ar.`;
}
