interface Env {
  ASSETS: Fetcher;
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

    // Default: serve static assets normally
    return env.ASSETS.fetch(request);
  },
};
