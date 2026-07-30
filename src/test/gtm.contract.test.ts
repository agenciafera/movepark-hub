import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O GTM mora no template `index.html`, fora da árvore React, então nenhum teste de
 * componente cobre ele: dá pra apagar o snippet inteiro sem quebrar nada. Este
 * contrato é a varredura de fonte que segura isso, e junto segura a CSP — o
 * `script-src 'self'` original não liberava googletagmanager.com, e promover a
 * política a enforce sem a allowlist mataria a tag em produção.
 */
const CONTAINER_ID = "GTM-KHBBZT9";

const indexHtml = readFileSync(join(process.cwd(), "index.html"), "utf8");
const headers = readFileSync(join(process.cwd(), "public", "_headers"), "utf8");

// O header em si, não a linha de comentário logo acima (que também cita a CSP).
const csp = headers
  .split("\n")
  .map((line) => line.trim())
  .find((line) => /^Content-Security-Policy(-Report-Only)?:/.test(line))!;

/** Extrai uma diretiva da CSP (ex.: "script-src") como lista de origens. */
function directive(name: string): string[] {
  const found = csp
    .slice(csp.indexOf(":") + 1)
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `));

  return found ? found.split(/\s+/).slice(1) : [];
}

describe("Google Tag Manager no template", () => {
  it("carrega o gtm.js com o container do projeto", () => {
    expect(indexHtml).toContain("https://www.googletagmanager.com/gtm.js?id=");
    expect(indexHtml).toContain(`"${CONTAINER_ID}"`);
  });

  it("inicializa o dataLayer com o evento gtm.js", () => {
    expect(indexHtml).toContain("dataLayer");
    expect(indexHtml).toContain('event: "gtm.js"');
  });

  it("fica no head e acima do script de tema", () => {
    const head = indexHtml.slice(indexHtml.indexOf("<head>"), indexHtml.indexOf("</head>"));
    expect(head).toContain("googletagmanager.com/gtm.js");
    expect(head.indexOf("googletagmanager.com/gtm.js")).toBeLessThan(head.indexOf("mp-theme"));
  });

  it("tem o fallback noscript logo depois do <body>", () => {
    const body = indexHtml.slice(indexHtml.indexOf("<body>"));
    const noscript = body.indexOf("<noscript");

    expect(noscript).toBeGreaterThan(-1);
    expect(body).toContain(`https://www.googletagmanager.com/ns.html?id=${CONTAINER_ID}`);
    // Antes do #root: o GTM pede o iframe imediatamente após a abertura do body.
    expect(noscript).toBeLessThan(body.indexOf('<div id="root">'));
  });

  it("usa o mesmo container nos dois snippets", () => {
    const ocorrencias = indexHtml.match(/GTM-[A-Z0-9]+/g) ?? [];

    expect(ocorrencias.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ocorrencias)).toEqual(new Set([CONTAINER_ID]));
  });
});

describe("CSP libera o GTM", () => {
  it("permite o gtm.js em script-src", () => {
    expect(directive("script-src")).toContain("https://www.googletagmanager.com");
  });

  it("permite o iframe do noscript em frame-src", () => {
    expect(directive("frame-src")).toContain("https://www.googletagmanager.com");
  });

  it("permite os beacons do GA4 em connect-src", () => {
    const connect = directive("connect-src");

    expect(connect).toContain("https://www.google-analytics.com");
    expect(connect).toContain("https://*.analytics.google.com");
  });

  // As tags de Ads do container batem nestes dois no page_view; sem eles a CSP
  // em enforce derrubaria a conversão sem derrubar o resto (falha silenciosa).
  it("permite os coletores do Google Ads em connect-src", () => {
    const connect = directive("connect-src");

    expect(connect).toContain("https://ad.doubleclick.net");
    expect(connect).toContain("https://www.google.com");
  });
});
