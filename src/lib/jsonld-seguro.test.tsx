import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Helmet, HelmetProvider, type HelmetServerState } from "react-helmet-async";
import { serializarJsonLd } from "./jsonld-seguro";

/**
 * O build pré-renderizado escreve o JSON-LD com `helmet.script.toString()`, e o
 * react-helmet-async 1.3 monta `"<script ...>" + innerHTML + "</script>"` sem escape. O
 * `JSON.stringify` também não escapa `<`. Um `</script>` dentro de qualquer texto do schema
 * (nome, endereço ou foto da unidade, resposta da FAQ, todos gravados pelo parceiro) fechava o
 * script no HTML publicado e o resto virava código no domínio movepark.co.
 */
const ATAQUE = "</script><script>alert(document.domain)</script>";

// Com DOM (happy-dom), o HelmetProvider se acha no navegador e não monta `context.helmet`, que é
// o caminho por onde o vite-react-ssg escreve o head no build. Aqui ele roda como no build.
const provider = HelmetProvider as unknown as { canUseDOM: boolean };
const canUseDOMOriginal = provider.canUseDOM;
beforeAll(() => {
  provider.canUseDOM = false;
});
afterAll(() => {
  provider.canUseDOM = canUseDOMOriginal;
});

function scriptDoBuild(conteudo: string): string {
  const context: { helmet?: HelmetServerState } = {};
  renderToString(
    <HelmetProvider context={context}>
      <Helmet>
        <script type="application/ld+json">{conteudo}</script>
      </Helmet>
    </HelmetProvider>,
  );
  return context.helmet!.script.toString();
}

describe("serializarJsonLd", () => {
  it("JSON.stringify cru fecha o script no HTML do build (o defeito que a função existe para evitar)", () => {
    expect(scriptDoBuild(JSON.stringify({ name: ATAQUE }))).toContain(
      "</script><script>alert(document.domain)</script>",
    );
  });

  it("no HTML do build, o texto do parceiro não fecha o script", () => {
    const html = scriptDoBuild(serializarJsonLd({ name: ATAQUE, address: "Rua <b>&</b>" }));
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toContain("<script>alert");
  });

  it("continua JSON válido e devolve o mesmo dado ao ler", () => {
    const dado = {
      "@type": "ParkingFacility",
      name: ATAQUE,
      text: "A & B > C, linha\u2028separada\u2029aqui",
      image: ["https://movepark.co/Estacionamentos/x/1.avif"],
    };
    const saida = serializarJsonLd(dado);
    expect(saida).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(saida)).toEqual(dado);
  });

  it("sem caractere especial, sai igual ao JSON.stringify", () => {
    const dado = { "@context": "https://schema.org", "@type": "WebPage", name: "Preços" };
    expect(serializarJsonLd(dado)).toBe(JSON.stringify(dado));
  });
});
