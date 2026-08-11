interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/**
 * Hosts liberados para indexação por buscador. É uma **allowlist**, de propósito.
 *
 * Hoje o Hub responde em `hub.movepark.co`, que é endereço técnico e NÃO pode
 * aparecer no Google: o conteúdo público daqui (`/destinos/*`, `/p/*`) disputa a
 * mesma intenção de busca que o `movepark.co` já publica, e dois domínios na mesma
 * intenção se canibalizam.
 *
 * A regra é allowlist porque o Hub vai **substituir** o `movepark.co`. No dia em que
 * este projeto atender o apex, o host já está na lista e a indexação volta sozinha.
 * Um `noindex` chumbado (em `public/_headers`, num meta fixo ou num robots.txt
 * estático) viajaria junto na migração e apagaria o site novo do índice. É esse o
 * acidente que a allowlist existe para evitar.
 *
 * Efeito colateral desejado: qualquer host fora da lista (`*.pages.dev`,
 * `*.workers.dev`, staging, preview) fica fora do índice permanentemente.
 */
const INDEXABLE_HOSTS = new Set(["movepark.co"]);

/**
 * Marca a resposta como não-indexável quando o host não é o canônico.
 *
 * `follow` de propósito: os links continuam sendo rastreados, então a autoridade
 * que o Hub aponta para fora não é descartada.
 *
 * O `robots.txt` segue com `Allow: /` e continua anunciando o sitemap, e isso não é
 * descuido. O Google só respeita `noindex` na página que ele consegue **abrir**;
 * bloquear no robots.txt deixaria as URLs já indexadas presas como "indexada, porém
 * bloqueada pelo robots.txt", sem descrição e sem previsão de saída. Manter o crawl
 * liberado é o que faz o `noindex` ser lido e as URLs caírem do índice.
 */
function applyIndexPolicy(response: Response, url: URL): Response {
  if (INDEXABLE_HOSTS.has(url.hostname)) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, follow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Categorias do blog no WordPress → destino no Hub.
 *
 * As categorias moram dentro do namespace `/blog/`, então `/blog/<categoria>/` e
 * `/blog/<slug-de-post>/` são indistinguíveis pela forma. Este é o conjunto
 * fechado das 11 categorias mais os apelidos que o legado já redirecionava; tudo
 * que não estiver aqui é tratado como post.
 *
 * `null` = não tem destino no Hub (Navegantes ainda não existe, e `dica-de-viagem`
 * não é aeroporto), então cai no índice do blog em vez de numa página genérica.
 */
const BLOG_CATEGORY_TO_DESTINATION: Record<string, string | null> = {
  "aeroporto-guarulhos": "aeroporto-internacional-de-sao-paulo-guarulhos",
  guarulhos: "aeroporto-internacional-de-sao-paulo-guarulhos",
  "aeroporto-viracopos": "aeroporto-de-viracopos",
  viracopos: "aeroporto-de-viracopos",
  campinas: "aeroporto-de-viracopos",
  "aeroporto-afonso-pena": "aeroporto-afonso-pena",
  "aeroporto-lisboa": "aeroporto-humberto-delgado",
  "aeroporto-confins": "aeroporto-de-confins",
  "aeroporto-congonhas": "aeroporto-de-congonhas",
  "aeroporto-navegantes": null,
  "dica-de-viagem": null,
  duvidas: null,
  "rio-de-janeiro": null,
  uncategorized: null,
};

/**
 * URLs legadas fora do namespace `/blog/`, vindas da tabela `ko1_redirects` do
 * plugin eps-301-redirects.
 *
 * O Search Console não enxerga nenhuma delas (o clique é atribuído ao destino do
 * redirect), então elas não aparecem em nenhum levantamento de tráfego. Nove
 * revelam que os posts já moraram na raiz do domínio, antes do prefixo `/blog/`.
 * Ver docs/specs/blog.md.
 */
const BLOG_LEGACY_PATHS: Record<string, string> = {
  "/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes":
    "/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/",
  "/aeroporto-guarulhos/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes":
    "/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/",
  "/qual-e-o-melhor-estacionamento-aeroporto-viracopos-2022":
    "/blog/qual-e-o-melhor-estacionamento-aeroporto-viracopos-2022/",
  "/qual-e-o-melhor-estacionamento-aeroporto-guarulhos-2023":
    "/blog/qual-e-o-melhor-estacionamento-aeroporto-guarulhos-2023/",
  "/estacionamento-aeroporto-guarulhos-veja-o-preco-dos-principais-estacionamentos":
    "/blog/estacionamento-aeroporto-guarulhos-veja-o-preco-dos-principais-estacionamentos/",
  "/quanto-custa-para-estacionar-no-aeroporto-viracopos":
    "/blog/quanto-custa-para-estacionar-no-aeroporto-viracopos/",
  "/conheca-os-5-principais-estacionamentos-no-aeroporto-de-guarulhos-em-2023":
    "/blog/conheca-os-5-principais-estacionamentos-no-aeroporto-de-guarulhos-em-2023/",
  "/estacionamento-perto-do-aeroporto-de-guarulhos-reserve-online":
    "/blog/estacionamento-perto-do-aeroporto-de-guarulhos-reserve-online/",
  "/como-evitar-problemas-no-estacionamento-do-aeroporto-guarulhos":
    "/blog/como-evitar-problemas-no-estacionamento-do-aeroporto-guarulhos/",
  "/encontre-sua-vaga-de-estacionamento-no-aeroporto-de-guarulhos":
    "/blog/encontre-sua-vaga-de-estacionamento-no-aeroporto-de-guarulhos/",
  // Post renomeado no WordPress: ponce-park virou aeropark.
  "/blog/ponce-park-descubra-se-o-estacionamento-aeroporto-gru-oferece-vagas-cobertas":
    "/blog/aeropark-descubra-se-o-estacionamento-aeroporto-gru-oferece-vagas-cobertas/",
};

const redirect301 = (to: string) =>
  new Response(null, { status: 301, headers: { Location: to, "Cache-Control": "no-cache" } });

/**
 * Política de URL do blog.
 *
 * O contrato é o do WordPress, porque são 93 URLs que o Google já indexou e que
 * respondem por 22,6% dos cliques do site: `/blog/<slug>/` com barra final
 * responde 200 direto, e a versão sem barra manda 301 para ela.
 *
 * Devolve `null` quando a requisição não é do blog e segue o fluxo normal.
 */
/**
 * Prefixos de listagem do blog. Tudo que não começa por um deles, e tem um
 * segmento só, é slug de post.
 */
const BLOG_LISTING_PREFIXES = new Set(["page", "categoria", "tag", "autor", "aeroporto"]);

export function blogRedirect(url: URL): Response | null {
  const path = url.pathname.replace(/\/+$/, "") || "/";

  const legacy = BLOG_LEGACY_PATHS[path];
  if (legacy) return redirect301(legacy + url.search);

  if (path !== "/blog" && !path.startsWith("/blog/")) return null;

  const segments = path.slice("/blog".length).split("/").filter(Boolean);
  if (!segments.length) return null;

  const semBarra = !url.pathname.endsWith("/");
  const paraCanonica = () => redirect301(`${path}/${url.search}`);

  if (BLOG_LISTING_PREFIXES.has(segments[0])) {
    // `/blog/categoria/<aeroporto>` é a forma que o Yoast emitia, e continua
    // indo para o destino: o slug de aeroporto nunca virou categoria editorial.
    if (segments[0] === "categoria" && segments[1] in BLOG_CATEGORY_TO_DESTINATION) {
      const destination = BLOG_CATEGORY_TO_DESTINATION[segments[1]];
      return redirect301(destination ? `/destinos/${destination}` : "/blog/");
    }
    return semBarra ? paraCanonica() : null;
  }

  if (segments.length > 1) return null;

  if (segments[0] in BLOG_CATEGORY_TO_DESTINATION) {
    const destination = BLOG_CATEGORY_TO_DESTINATION[segments[0]];
    return redirect301(destination ? `/destinos/${destination}` : "/blog/");
  }

  // Post sem a barra final: a canônica é com barra, igual ao WordPress.
  return semBarra ? paraCanonica() : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return applyIndexPolicy(await serve(request, env), new URL(request.url));
  },
};

/**
 * Slugs publicados, em cache por isolate.
 *
 * Só o sucesso entra em cache. Guardar a falha faria uma leitura ruim desligar a
 * regra até o isolate morrer, e o custo de tentar de novo é uma leitura de asset
 * que só acontece enquanto o manifesto realmente não está lá.
 */
let blogSlugsCache: Set<string> | undefined;

async function blogSlugs(env: Env, url: URL): Promise<Set<string> | null> {
  if (blogSlugsCache) return blogSlugsCache;
  try {
    const res = await env.ASSETS.fetch(new Request(new URL("/blog-slugs.json", url)));
    const tipo = res.headers.get("Content-Type") ?? "";
    // Manifesto ausente cai no fallback SPA (HTML). Sem manifesto confiável a
    // regra se desliga, em vez de mandar 404 em post que existe.
    if (!res.ok || !tipo.includes("json")) return null;
    blogSlugsCache = new Set((await res.json()) as string[]);
    return blogSlugsCache;
  } catch {
    return null;
  }
}

async function serve(request: Request, env: Env): Promise<Response> {
  const accept = request.headers.get("Accept") ?? "";

  // Política de URL do blog antes de tudo: categoria e URL legada saem em 301
  // sem chegar no asset. Ver docs/specs/blog.md.
  const blogHop = blogRedirect(new URL(request.url));
  if (blogHop) return blogHop;

  // Content negotiation: serve markdown when agents request it
  if (accept.includes("text/markdown")) {
    const url = new URL(request.url);

    // Try to serve a pre-generated .md file for the path
    const mdRequest = new Request(new URL(url.pathname.replace(/\/?$/, ".md"), url), request);
    const mdResponse = await env.ASSETS.fetch(mdRequest);
    if (mdResponse.ok) {
      return new Response(mdResponse.body, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          Vary: "Accept",
          "X-Markdown-Tokens": "reduced",
        },
      });
    }

    // Fallback: serve llms.txt as the markdown representation of the site
    const llmsResponse = await env.ASSETS.fetch(new Request(new URL("/llms.txt", url), request));
    if (llmsResponse.ok) {
      return new Response(llmsResponse.body, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          Vary: "Accept",
          "X-Markdown-Tokens": "reduced",
        },
      });
    }
  }

  // Requisição de asset com hash (ex.: /assets/app-XXXX.js, static-loader-data-*.json):
  // se o arquivo não existe mais (deploy novo invalidou o hash antigo), o
  // `not_found_handling: single-page-application` devolveria o index.html (200, HTML).
  // Isso faz o `.json()`/import do cliente estourar com "Unexpected token '<'". Preferimos
  // um 404 limpo — o cliente trata como "build velho" e recarrega (ver src/lib/stale-build.ts).
  const url = new URL(request.url);
  const lastSegment = url.pathname.split("/").pop() ?? "";
  const isAssetRequest = /\.[a-z0-9]+$/i.test(lastSegment) && !/\.html?$/i.test(lastSegment);
  if (isAssetRequest) {
    const assetResponse = await env.ASSETS.fetch(request);
    const type = assetResponse.headers.get("Content-Type") ?? "";
    if (assetResponse.ok && type.includes("text/html")) {
      // Asset ausente que caiu no fallback SPA — devolve 404 em vez de HTML.
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return assetResponse;
  }

  /*
    Post inexistente devolve 404, não a casca da SPA.

    O `not_found_handling: single-page-application` do Pages responde 200 com o
    index para qualquer caminho, e o Google trata isso como soft 404: indexa a URL
    como página real e vazia. Foi parte do que sujou o índice do site legado (94
    URLs em "rastreada, mas não indexada").

    O manifesto sai do build (`writeBlogSlugManifest` no vite.config) e fica em
    cache no escopo do módulo, então custa uma leitura por isolate, não por
    requisição.
  */
  const post = url.pathname.match(/^\/blog\/([^/]+)\/?$/);
  if (post && !BLOG_LISTING_PREFIXES.has(post[1])) {
    const slugs = await blogSlugs(env, url);
    if (slugs && !slugs.has(post[1])) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
  }

  // Barra final do blog sem salto de redirect.
  //
  // O SSG emite arquivo plano (`dist/blog/<slug>.html`), então o Cloudflare Pages
  // responderia `/blog/<slug>/` com um 307 para a versão sem barra. Isso trocaria
  // a canônica de 93 URLs indexadas e ainda por um redirect temporário. Aqui a
  // URL com barra é servida direto, buscando o asset internamente.
  if (url.pathname.startsWith("/blog/") && url.pathname.endsWith("/")) {
    const withoutSlash = new URL(url.pathname.replace(/\/+$/, ""), url);
    withoutSlash.search = url.search;
    return env.ASSETS.fetch(new Request(withoutSlash, request));
  }

  // Default: serve static assets normally
  return env.ASSETS.fetch(request);
}
