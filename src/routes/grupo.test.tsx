import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import GrupoPage from "@/routes/grupo";
import { GRUPO } from "@/features/content/pages";
import { MARCAS, organizationSchema } from "@/lib/jsonld";

function renderPage() {
  return renderWithProviders(
    <HelmetProvider>
      <GrupoPage />
    </HelmetProvider>,
  );
}

describe("GrupoPage — /grupo", () => {
  it("abre com um único h1 e nomeia os quatro produtos", () => {
    renderPage();

    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent("O grupo Movepark");

    for (const nome of ["Movepark Hub", "Go2Park", "Go2Med", "Coopark"]) {
      expect(screen.getAllByRole("heading", { name: nome }).length).toBeGreaterThan(0);
    }
  });

  it("declara o estágio de cada produto, e o que não existe ainda diz que não existe", () => {
    renderPage();

    // Produto em desenvolvimento anunciado sem ressalva vira promessa: a página
    // pode listar o que ainda não dá para contratar, desde que diga isso.
    expect(screen.getAllByText(/Ainda não está disponível para contratação/i)).toHaveLength(2);
  });

  it("leva ao site do Go2Park sem nofollow", () => {
    renderPage();

    const link = screen.getByRole("link", { name: "go2park.com.br" });
    expect(link).toHaveAttribute("href", "https://go2park.com.br");
    expect(link.getAttribute("rel") ?? "").not.toContain("nofollow");
  });

  it("publica a identidade legal, que é o que desambigua a marca dos homônimos", () => {
    renderPage();

    expect(screen.getByText(/68\.183\.164\/0001-35/)).toBeInTheDocument();
  });
});

describe("as marcas no dado estruturado", () => {
  it("saem como `brand` da Movepark, com as quatro", () => {
    const s = organizationSchema() as Record<string, unknown>;
    const brand = s.brand as { "@type": string; name: string }[];

    expect(brand.map((b) => b.name)).toEqual([
      "Movepark Hub",
      "Go2Park",
      "Go2Med",
      "Coopark",
    ]);
    expect(brand.every((b) => b["@type"] === "Brand")).toBe(true);
  });

  /**
   * A trava da ADR do grupo (docs/specs/grupo-movepark.md §3): enquanto a Go2Park
   * faturar pelo CNPJ da Agência Fera, o schema não pode afirmar sociedade. Este
   * teste falha no dia em que alguém promover `brand` a `subOrganization` sem
   * passar pela decisão, que é exatamente quando ninguém lembraria do motivo.
   */
  it("não afirma estrutura societária que o contrato social não sustenta", () => {
    const s = organizationSchema() as Record<string, unknown>;

    expect(s.subOrganization).toBeUndefined();
    expect(s.parentOrganization).toBeUndefined();
    expect(s.owns).toBeUndefined();
  });

  it("a Go2Park aponta para o site próprio dela", () => {
    expect(MARCAS.find((m) => m.name === "Go2Park")?.url).toBe("https://go2park.com.br");
  });
});

/**
 * O gêmeo Markdown é escrito à mão (as páginas institucionais não passam pelo
 * gerador de artefatos, que só cobre FAQ, preços, destinos e blog). Escrito à mão
 * é escrito uma vez e esquecido na segunda edição, então o que impede a divergência
 * é este teste, e não a boa vontade de quem editar.
 */
describe("public/grupo.md", () => {
  const md = readFileSync(join(process.cwd(), "public", "grupo.md"), "utf8");

  it("tem o mesmo título e a mesma data de revisão da página", () => {
    expect(md).toContain(`# ${GRUPO.title}`);
    expect(md).toContain(GRUPO.updated);
  });

  it("tem uma seção para cada seção da página", () => {
    for (const s of GRUPO.sections) {
      expect(md).toContain(`## ${s.title}`);
    }
  });

  it("repete o texto de cada parágrafo da página", () => {
    const paragrafos = GRUPO.sections
      .flatMap((s) => s.blocks)
      .flatMap((b) => (b.type === "p" ? [b.text] : []));

    expect(paragrafos.length).toBeGreaterThan(8);
    for (const p of paragrafos) {
      expect(md).toContain(p);
    }
  });
});
