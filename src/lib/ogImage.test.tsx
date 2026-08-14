import { describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { OG_FALLBACK, OgImage, ogImageUrl } from "./ogImage";

function ogImageNoHead() {
  return document.head.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;
}
function quantasOgImage() {
  return document.head.querySelectorAll('meta[property="og:image"]').length;
}

describe("ogImageUrl", () => {
  it("passa pelo render/image com o recorte do card", () => {
    const url = ogImageUrl("marca");
    expect(url).toContain("/storage/v1/render/image/public/");
    expect(url).toContain("width=1200");
    expect(url).toContain("height=630");
    expect(url).toContain("resize=cover");
  });

  it("toda área aponta para um arquivo do bucket", () => {
    for (const [area, url] of Object.entries(OG_FALLBACK)) {
      expect(url, area).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/assets-public\/og\/.+\.jpg$/);
    }
  });
});

describe("OgImage no shell", () => {
  it("declara a imagem da área, com as metas que o card precisa", async () => {
    render(
      <HelmetProvider>
        <OgImage area="destinos" />
      </HelmetProvider>,
    );
    await waitFor(() => expect(ogImageNoHead()).toContain("destinos-"));
    expect(document.head.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe(
      "summary_large_image",
    );
    expect(
      document.head.querySelector('meta[property="og:image:width"]')?.getAttribute("content"),
    ).toBe("1200");
  });

  /**
   * O ponto do desenho: o shell dá o default e a página sobrescreve. Se a dedupe do
   * helmet parar de valer, o card passa a ter DUAS og:image e o crawler pega a
   * primeira, que é a genérica, e a foto real da página some do compartilhamento.
   */
  it("a página sobrescreve o default do shell, e sobra uma só", async () => {
    const daPagina = "https://exemplo.test/hero-do-destino.webp";
    render(
      <HelmetProvider>
        <OgImage area="marca" />
        <Helmet>
          <meta property="og:image" content={daPagina} />
        </Helmet>
      </HelmetProvider>,
    );
    await waitFor(() => expect(ogImageNoHead()).toBe(daPagina));
    expect(quantasOgImage()).toBe(1);
  });
});
