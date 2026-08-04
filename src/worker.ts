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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return applyIndexPolicy(await serve(request, env), new URL(request.url));
  },
};

async function serve(request: Request, env: Env): Promise<Response> {
  const accept = request.headers.get("Accept") ?? "";

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

  // Default: serve static assets normally
  return env.ASSETS.fetch(request);
}
