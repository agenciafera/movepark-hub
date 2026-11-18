import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captureAttribution, MAX_AGE_DAYS } from "@/lib/utm";

/**
 * Canal de parceiro sem a bolinha de WhatsApp da Movepark (pedido da Pare Seguro,
 * 12/11/2026).
 *
 * A decisão mora num script do `index.html`, fora da árvore React, porque precisa
 * acontecer antes do paint: o HTML pré-renderizado já traz a bolinha, e esconder
 * depois da hidratação faria ela piscar na tela de quem veio do parceiro. Por estar
 * fora do React, nenhum teste de componente cobre o script. Este contrato roda o
 * script de verdade, e cruza com `src/lib/utm.ts` para os dois lerem a mesma
 * atribuição (chave `mp_utm`, último clique, janela de `MAX_AGE_DAYS`).
 */
const indexHtml = readFileSync(join(process.cwd(), "index.html"), "utf8");

function scriptDoCanal(): string {
  const marca = indexHtml.indexOf('setAttribute("data-canal-parceiro"');
  expect(marca).toBeGreaterThan(-1);
  const inicio = indexHtml.lastIndexOf("<script>", marca) + "<script>".length;
  const fim = indexHtml.indexOf("</script>", marca);
  return indexHtml.slice(inicio, fim);
}

function rodar(url: string, referrer = "") {
  window.history.replaceState({}, "", url);
  document.documentElement.removeAttribute("data-canal-parceiro");
  Object.defineProperty(document, "referrer", { value: referrer, configurable: true });
  try {
    new Function(scriptDoCanal())();
  } finally {
    delete (document as unknown as Record<string, unknown>).referrer;
  }
  return document.documentElement.hasAttribute("data-canal-parceiro");
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-canal-parceiro");
  window.history.replaceState({}, "", "/");
});

describe("canal de parceiro no template", () => {
  it("fica no head, para marcar o <html> antes do paint", () => {
    const head = indexHtml.slice(indexHtml.indexOf("<head>"), indexHtml.indexOf("</head>"));
    expect(head).toContain('setAttribute("data-canal-parceiro"');
  });

  it("marca quem chega com utm_source=pareseguro, sem diferença de caixa", () => {
    expect(rodar("/p/gru/pare-seguro?utm_source=pareseguro&utm_medium=site")).toBe(true);
    expect(rodar("/?utm_source=PareSeguro")).toBe(true);
  });

  it("não marca visita sem UTM nem de outra origem", () => {
    expect(rodar("/")).toBe(false);
    expect(rodar("/?utm_source=google&utm_medium=cpc")).toBe(false);
  });

  /* A UTM some da URL na primeira navegação; o checkout continua sendo a venda do
     parceiro. Quem grava é o `captureAttribution`, o mesmo da comissão. */
  it("segue marcado nas páginas seguintes, pela atribuição guardada", () => {
    captureAttribution("?utm_source=pareseguro", { pathname: "/", referrer: "" });
    expect(rodar("/checkout")).toBe(true);
  });

  it("solta quando o último clique foi de outra campanha", () => {
    captureAttribution("?utm_source=pareseguro", { pathname: "/", referrer: "" });
    expect(rodar("/?utm_source=google")).toBe(false);
  });

  it("solta quando a atribuição passou da janela", () => {
    const antigo = new Date(Date.now() - (MAX_AGE_DAYS + 1) * 86_400_000);
    captureAttribution("?utm_source=pareseguro", { now: antigo, pathname: "/", referrer: "" });
    expect(rodar("/checkout")).toBe(false);
  });

  /* 18/11/2026: o site de origem conta como o UTM, inclusive guardado. */
  it("marca quem chega do site do parceiro, sem UTM ou com UTM de outra origem", () => {
    expect(rodar("/p/gru/pare-seguro", "https://pareseguro.com/")).toBe(true);
    expect(rodar("/p/gru/pare-seguro", "https://www.pareseguro.com/precos")).toBe(true);
    expect(rodar("/?utm_source=google&utm_campaign=gru-marca", "https://pareseguro.com/")).toBe(true);
    expect(rodar("/", "https://falsopareseguro.com/")).toBe(false);
    expect(rodar("/", "https://www.google.com/")).toBe(false);
  });

  it("segue marcado nas páginas seguintes pela chegada guardada", () => {
    captureAttribution("", { pathname: "/", referrer: "https://pareseguro.com/" });
    expect(rodar("/checkout")).toBe(true);
  });

  it("segue marcado pelo site do clique guardado, mesmo com UTM de outra origem", () => {
    captureAttribution("?utm_source=google", { pathname: "/", referrer: "https://pareseguro.com/" });
    expect(rodar("/checkout")).toBe(true);
  });

  it("solta quando o último clique foi de outra campanha, depois da chegada do parceiro", () => {
    captureAttribution("", { pathname: "/", referrer: "https://pareseguro.com/" });
    captureAttribution("?utm_source=google", { pathname: "/", referrer: "" });
    expect(rodar("/checkout")).toBe(false);
  });

  it("usa a mesma janela de dias que a atribuição", () => {
    expect(scriptDoCanal()).toContain(`${MAX_AGE_DAYS} * 86400000`);
  });

  it("não quebra com o que estiver ilegível no storage", () => {
    localStorage.setItem("mp_ref", "{quebrado");
    expect(rodar("/")).toBe(false);
    localStorage.clear();
    localStorage.setItem("mp_utm", "{quebrado");
    expect(rodar("/")).toBe(false);
  });
});
