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
