// Cloudflare Pages Function — content negotiation de Markdown para agentes (E0.8-c).
// Produção é servida pelo Cloudflare Pages; o src/worker.ts (deploy Workers via wrangler) NÃO
// entra nesse pipeline, então a negociação vive aqui, como middleware do Pages. Roda em toda
// request, mas só INTERCEPTA quando o cliente pede `Accept: text/markdown` — senão passa direto.
// Mantém paridade com src/worker.ts: tenta o `.md` pré-gerado da rota, senão cai no llms.txt.

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
  env: Env;
}

const MD_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  Vary: "Accept",
  "X-Markdown-Tokens": "reduced",
};

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, next, env } = context;
  const accept = request.headers.get("Accept") ?? "";

  if (accept.includes("text/markdown")) {
    const url = new URL(request.url);

    // 1) `.md` pré-gerado para o caminho (ex.: /destinos/gru → /destinos/gru.md)
    const mdRequest = new Request(new URL(url.pathname.replace(/\/?$/, ".md"), url), request);
    const mdResponse = await env.ASSETS.fetch(mdRequest);
    if (mdResponse.ok) {
      return new Response(mdResponse.body, { status: 200, headers: MD_HEADERS });
    }

    // 2) Fallback: llms.txt como representação markdown do site
    const llmsResponse = await env.ASSETS.fetch(new Request(new URL("/llms.txt", url), request));
    if (llmsResponse.ok) {
      return new Response(llmsResponse.body, { status: 200, headers: MD_HEADERS });
    }
  }

  // Sem pedido de markdown (ou sem asset): serve normalmente.
  return next();
}
