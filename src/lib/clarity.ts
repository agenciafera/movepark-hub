import Clarity from "@microsoft/clarity";
import { DEFAULT_SITE_URL } from "./site-host.mjs";

/**
 * Microsoft Clarity: mapa de calor, gravação de sessão e métrica de rage click.
 *
 * Por que aqui e não no `index.html` junto do GTM: o snippet do Clarity dentro do template
 * grava tudo, em todo host, desde o primeiro byte, e não tem como condicionar sem escrever
 * JavaScript solto no HTML. Em módulo, o gate fica testável e o pacote oficial
 * (`@microsoft/clarity`) cuida da injeção, inclusive da guarda contra script duplicado.
 *
 * O ID do projeto é público por natureza (vai no `src` do script em toda página), então é
 * literal e não variável de ambiente: env var aqui daria a falsa impressão de segredo e
 * ainda quebraria o build de quem não a definisse.
 */
export const CLARITY_PROJECT_ID = "xwqaug4a9m";

/** Único host que grava. Sai do canônico, do mesmo jeito que o `INDEXABLE_HOSTS` do worker. */
const HOST_CANONICO = new URL(DEFAULT_SITE_URL).hostname;

/**
 * Se este host pode gravar sessão.
 *
 * É allowlist de um host só, pela mesma razão da política de índice: `localhost`,
 * `*.pages.dev`, `*.workers.dev` e preview respondem o mesmo app, e sessão de
 * desenvolvimento misturada com a de produção estraga funil, mapa de calor e a métrica de
 * rage click sem avisar. Um dashboard sujo é pior que dashboard nenhum, porque continua
 * parecendo confiável.
 */
export function shouldLoadClarity(hostname: string | undefined | null): boolean {
  return hostname === HOST_CANONICO;
}

/**
 * Injeta o Clarity. Devolve se carregou, para o teste enxergar a decisão.
 *
 * Idempotente por dois motivos somados: o efeito que chama roda uma vez, e o próprio pacote
 * desiste quando já existe a tag `#clarity-script` no documento.
 */
export function initClarity(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (!shouldLoadClarity(window.location.hostname)) return false;

  Clarity.init(CLARITY_PROJECT_ID);
  return true;
}
