import { describe, expect, it, vi } from "vitest";
import worker from "./worker";

const HTML = "<!DOCTYPE html><html><head></head><body>app</body></html>";

/** Simula o `env.ASSETS` do Cloudflare com `not_found_handling: single-page-application`:
 *  arquivos conhecidos voltam com seu content-type; qualquer outro cai no index.html (HTML 200). */
function makeEnv(files: Record<string, { body: string; type: string }>) {
  const assets = {
    fetch: vi.fn(async (request: Request) => {
      const { pathname } = new URL(request.url);
      const hit = files[pathname];
      if (hit) {
        return new Response(hit.body, { status: 200, headers: { "Content-Type": hit.type } });
      }
      // fallback SPA: sempre HTML 200
      return new Response(HTML, { status: 200, headers: { "Content-Type": "text/html" } });
    }),
  };
  return { ASSETS: assets };
}

function req(path: string, headers?: Record<string, string>, host = "hub.movepark.co") {
  return new Request(`https://${host}${path}`, { headers });
}

describe("worker asset fallback", () => {
  it("devolve 404 (não HTML) para asset com hash que sumiu", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/static-loader-data-manifest-OLDHASH.json"), env);
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type") ?? "").not.toContain("text/html");
  });

  it("devolve 404 para um chunk .js com hash antigo ausente", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/assets/app-OLD.js"), env);
    expect(res.status).toBe(404);
  });

  it("repassa um asset real com o content-type correto", async () => {
    const env = makeEnv({
      "/assets/app-NEW.js": { body: "console.log(1)", type: "application/javascript" },
    });
    const res = await worker.fetch(req("/assets/app-NEW.js"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("javascript");
    expect(await res.text()).toContain("console.log");
  });

  it("repassa navegação de rota (sem extensão) como HTML", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/destinos"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/html");
  });

  it("serve markdown quando o agente pede text/markdown", async () => {
    const env = makeEnv({
      "/destinos.md": { body: "# Destinos", type: "text/plain" },
    });
    const res = await worker.fetch(req("/destinos", { Accept: "text/markdown" }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/markdown");
    expect(await res.text()).toContain("# Destinos");
  });
});

describe("política de indexação por host", () => {
  it("marca noindex no subdomínio do Hub", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/destinos"), env);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
  });

  // O Hub vai assumir o `movepark.co`. Se este teste quebrar, a migração vai subir
  // o site novo com noindex e ele nunca entra no Google.
  it("NÃO marca noindex no domínio canônico", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/destinos", undefined, "movepark.co"), env);
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("marca noindex nos hosts de preview do Cloudflare", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/", undefined, "movepark-hub.pages.dev"), env);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
  });

  it("marca noindex também na resposta markdown dos agentes", async () => {
    const env = makeEnv({ "/sobre.md": { body: "# Sobre", type: "text/plain" } });
    const res = await worker.fetch(req("/sobre", { Accept: "text/markdown" }), env);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
    expect(res.headers.get("Content-Type") ?? "").toContain("text/markdown");
  });

  it("preserva corpo e content-type ao acrescentar o header", async () => {
    const env = makeEnv({
      "/assets/app-NEW.js": { body: "console.log(1)", type: "application/javascript" },
    });
    const res = await worker.fetch(req("/assets/app-NEW.js"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("javascript");
    expect(await res.text()).toContain("console.log");
  });

  it("não quebra a resposta 404 sem corpo", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/assets/app-OLD.js"), env);
    expect(res.status).toBe(404);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
  });
});
