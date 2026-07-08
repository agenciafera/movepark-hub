interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
            "Vary": "Accept",
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
            "Vary": "Accept",
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
  },
};
