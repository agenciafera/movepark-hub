import { describe, expect, it } from "vitest";

import { ORG_ID, blogPostingSchema, organizationSchema, webSiteSchema } from "./jsonld";

/**
 * A auditoria de 24/09/2026 contra o comparador concorrente: ele ancorava
 * `Organization` e `WebSite` com `@id` e amarrava o `publisher` do post a esse id; nós
 * repetíamos o bloco solto. Sem `@id`, a organização da home, a do post e a do destino
 * são três coisas que por acaso têm o mesmo nome, e nenhum sinal de autoridade acumula.
 */
describe("entidade única no grafo", () => {
  it("Organization e o publisher do post compartilham o mesmo @id", () => {
    const org = organizationSchema();
    const post = blogPostingSchema({
      title: "Título",
      slug: "slug",
      publishedAt: "2026-09-24T00:00:00Z",
    });
    expect(org["@id"]).toBe(ORG_ID);
    expect((post.publisher as { "@id": string })["@id"]).toBe(ORG_ID);
  });

  it("o publisher do post DESCREVE o nó, não só aponta para ele", () => {
    // Só a home e o /sobre emitem a Organization completa. Um `{"@id"}` solto numa
    // página que não define o nó é referência pendurada, pior que a cópia.
    const pub = blogPostingSchema({
      title: "t",
      slug: "s",
      publishedAt: "2026-09-24T00:00:00Z",
    }).publisher as Record<string, unknown>;
    expect(pub["@type"]).toBe("Organization");
    expect(pub.name).toBe("Movepark");
    expect(pub.url).toBeTruthy();
  });

  it("o WebSite aponta para a Organization, e os dois têm @id", () => {
    const site = webSiteSchema();
    expect(site["@id"]).toBe("https://movepark.co/#website");
    expect((site.publisher as { "@id": string })["@id"]).toBe(ORG_ID);
  });

  it("declara escopo geográfico e expertise temática", () => {
    const org = organizationSchema();
    expect(org.areaServed).toMatchObject({ "@type": "Country", name: "Brasil" });
    expect(org.knowsAbout).toContain("Estacionamento de aeroporto");
    expect(org.alternateName).toContain("Movepark Brasil");
  });

  it("mantém os sinais de entidade que já tínhamos", () => {
    // CNPJ e razão social são âncoras fortes de entidade no Brasil, e nenhum dos dois
    // concorrentes emite.
    const org = organizationSchema();
    expect(org.taxID).toBe("68.183.164/0001-35");
    expect(org.legalName).toBe("Movepark Tecnologia Ltda");
    expect((org.sameAs as string[]).length).toBeGreaterThan(0);
  });
});
