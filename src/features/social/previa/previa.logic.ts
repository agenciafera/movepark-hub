import { LIMITE_GANCHO } from "../social.logic";
import type { SocialPost, SocialPostStatus } from "@/types/domain";

/**
 * Regras da prévia estilo Instagram no diálogo da fila (E3.6). É só visual: nada vai para a Meta
 * e nada é gravado. Os números e os comentários são fictícios e determinísticos a partir do id do
 * post, para a prévia não mudar a cada abertura.
 *
 * Spec: docs/specs/instagram-fila-de-publicacao.md (seção 4)
 */

export const USUARIO = "moveparkestacionamento";
export const AVATAR = "/icon-192.png";

/** O Instagram não usa Inter: a moldura da prévia usa a fonte do sistema, como o app. */
export const FONTE_DO_INSTAGRAM =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** O que a prévia lê de um post. O `SocialPost` inteiro serve; o recorte deixa o teste enxuto. */
export type PostDaPrevia = Pick<SocialPost, "id" | "caption" | "slides" | "scheduled_at">;
export type PostDaGrade = Pick<
  SocialPost,
  "id" | "status" | "slides" | "scheduled_at" | "published_at"
>;

/** FNV-1a de 32 bits: simples, sem dependência, e o mesmo texto dá sempre o mesmo número. */
function hash(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Curtidas de 80 a 420 e comentários de 3 a 24. */
export function numerosFicticios(id: string): { curtidas: number; comentarios: number } {
  const h = hash(id);
  return { curtidas: 80 + (h % 341), comentarios: 3 + ((h >>> 9) % 22) };
}

export type ComentarioFicticio = { usuario: string; texto: string };

/** Genéricos de propósito: nenhum promete vaga, preço, cancelamento ou cita concorrente (ADR-009). */
const BANCO_DE_COMENTARIOS: ComentarioFicticio[] = [
  { usuario: "camila.viaja", texto: "Salvei pra próxima viagem" },
  { usuario: "rafa.campos", texto: "Não sabia dessa diferença" },
  { usuario: "juliana.mendes", texto: "Boa, vou mostrar pra minha mãe que vai pra Campinas" },
  { usuario: "thiago.rocha", texto: "Boa dica, valeu!" },
  { usuario: "bia.passeia", texto: "Mandei pro grupo da família" },
  { usuario: "leo.nogueira", texto: "Vou rever isso antes de viajar em dezembro" },
  { usuario: "marina.souza", texto: "Isso me ajudou bastante" },
  { usuario: "diego.voa", texto: "Quem mais vai viajar no feriado?" },
];

/** Dois comentários do banco, sempre os mesmos para o mesmo id e nunca o mesmo duas vezes. */
export function comentariosFicticios(id: string): ComentarioFicticio[] {
  const h = hash(id);
  const n = BANCO_DE_COMENTARIOS.length;
  const primeiro = h % n;
  const segundo = (primeiro + 1 + ((h >>> 5) % (n - 1))) % n;
  return [BANCO_DE_COMENTARIOS[primeiro], BANCO_DE_COMENTARIOS[segundo]];
}

const FOLGA_PARA_NAO_CORTAR_PALAVRA = 20;

/**
 * O trecho da legenda que o feed mostra antes do "mais". Corta em `LIMITE_GANCHO`; se isso partiria
 * uma palavra, volta até o último espaço, desde que ele esteja nos últimos 20 caracteres. Uma palavra
 * mais longa que isso (URL, hashtag enorme) é cortada seca, como o app faz.
 */
export function partirLegendaFeed(caption: string): { visivel: string; temMais: boolean } {
  if (caption.length <= LIMITE_GANCHO) return { visivel: caption, temMais: false };
  let corte = LIMITE_GANCHO;
  if (!/\s/.test(caption.charAt(LIMITE_GANCHO))) {
    for (let i = LIMITE_GANCHO - 1; i >= LIMITE_GANCHO - FOLGA_PARA_NAO_CORTAR_PALAVRA; i--) {
      if (/\s/.test(caption.charAt(i))) {
        corte = i;
        break;
      }
    }
  }
  return { visivel: caption.slice(0, corte).trimEnd(), temMais: true };
}

export type TokenLegenda = { tipo: "texto" | "hashtag" | "mencao"; valor: string };

const HASHTAG_OU_MENCAO = /#[\p{L}\p{N}_]+|@[A-Za-z0-9._]+/gu;
const CARACTERE_DE_PALAVRA = /[\p{L}\p{N}_.]/u;

/**
 * Separa hashtags e menções do texto corrido, para a prévia pintá-las de azul. As quebras de linha
 * ficam dentro dos trechos de texto. Duas exceções às regex: o ponto final depois de uma menção
 * não faz parte dela, e um `@` colado numa palavra (e-mail) não é menção.
 */
export function tokenizarLegenda(texto: string): TokenLegenda[] {
  const saida: TokenLegenda[] = [];
  const empurrar = (tipo: TokenLegenda["tipo"], valor: string) => {
    if (!valor) return;
    const ultimo = saida[saida.length - 1];
    if (tipo === "texto" && ultimo?.tipo === "texto") ultimo.valor += valor;
    else saida.push({ tipo, valor });
  };

  let cursor = 0;
  for (const m of texto.matchAll(HASHTAG_OU_MENCAO)) {
    const inicio = m.index ?? 0;
    const achado = m[0];
    empurrar("texto", texto.slice(cursor, inicio));
    cursor = inicio + achado.length;

    if (achado.startsWith("#")) {
      empurrar("hashtag", achado);
      continue;
    }
    const anterior = texto.charAt(inicio - 1);
    const limpo = achado.replace(/\.+$/, "");
    if ((anterior && CARACTERE_DE_PALAVRA.test(anterior)) || limpo.length < 2) {
      empurrar("texto", achado);
      continue;
    }
    empurrar("mencao", limpo);
    empurrar("texto", achado.slice(limpo.length));
  }
  empurrar("texto", texto.slice(cursor));
  return saida;
}

const DATA_DA_PREVIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "numeric",
  month: "long",
});

/** O dia em São Paulo, por extenso e em minúsculas, como o feed mostra: "22 de outubro". */
export function formatarDataPrevia(iso: string): string {
  return DATA_DA_PREVIA.format(new Date(iso));
}

/** Passo `direcao` a partir de `atual`, limitado entre 0 e `total - 1`. */
export function proximoIndice(atual: number, total: number, direcao: 1 | -1): number {
  return Math.min(Math.max(atual + direcao, 0), Math.max(total - 1, 0));
}

/** Quantos outros posts a grade mostra, e quantas células ela tem no total (3 colunas, 2 linhas). */
export const OUTROS_NA_GRADE = 5;
export const CELULAS_DA_GRADE = 6;

const STATUS_NA_GRADE: SocialPostStatus[] = ["published", "publishing", "approved"];

/**
 * Os outros posts que a grade do perfil mostraria ao lado deste: publicados, publicando e
 * agendados (o que está no perfil ou vai estar), do mais recente para o mais antigo, até 5. Para o
 * publicado vale a hora em que saiu, que pode ter sido depois da marcada.
 */
export function postsDaGrade(idDestePost: string, fila: PostDaGrade[]): PostDaGrade[] {
  const quando = (p: PostDaGrade) => Date.parse(p.published_at ?? p.scheduled_at);
  return fila
    .filter((p) => p.id !== idDestePost && STATUS_NA_GRADE.includes(p.status))
    .sort((a, b) => quando(b) - quando(a))
    .slice(0, OUTROS_NA_GRADE);
}

/** Tempo de cada story na tela, como no Instagram. */
export const STORY_MS = 5000;
/** De quanto em quanto a barra do story anda. */
export const STORY_TICK_MS = 50;

export type StoryEstado = { indice: number; decorrido: number; terminou: boolean };
export type StoryAcao =
  | { tipo: "tick" }
  | { tipo: "proximo" }
  | { tipo: "anterior" }
  | { tipo: "reiniciar" };

export const STORY_INICIAL: StoryEstado = { indice: 0, decorrido: 0, terminou: false };

function avancar(estado: StoryEstado, total: number): StoryEstado {
  const indice = proximoIndice(estado.indice, total, 1);
  // Sem para onde ir, o último story fica na tela com a barra cheia: não volta ao início.
  if (indice === estado.indice) return { indice, decorrido: STORY_MS, terminou: true };
  return { indice, decorrido: 0, terminou: false };
}

/** O andamento dos stories: o tempo enche a barra, o toque pula, e o fim da fila para. */
export function storyReducer(estado: StoryEstado, acao: StoryAcao, total: number): StoryEstado {
  switch (acao.tipo) {
    case "tick": {
      if (estado.terminou) return estado;
      const decorrido = estado.decorrido + STORY_TICK_MS;
      return decorrido < STORY_MS ? { ...estado, decorrido } : avancar(estado, total);
    }
    case "proximo":
      return avancar(estado, total);
    case "anterior":
      return { indice: proximoIndice(estado.indice, total, -1), decorrido: 0, terminou: false };
    case "reiniciar":
      return STORY_INICIAL;
  }
}
