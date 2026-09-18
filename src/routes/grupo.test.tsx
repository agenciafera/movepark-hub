import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, within } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import GrupoPage from "@/routes/grupo";
import { MARCAS, RESPONSAVEIS, ESTAGIO_ROTULO } from "@/features/grupo/marcas";
import { organizationSchema } from "@/lib/jsonld";

function renderPage() {
  return renderWithProviders(
    <HelmetProvider>
      <GrupoPage />
    </HelmetProvider>,
  );
}

describe("GrupoPage — /grupo", () => {
  it("abre com um único h1 na faixa de hero", () => {
    renderPage();
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent("Quatro produtos, a mesma ideia");
  });

  /**
   * O pedido que originou o redesenho: a página tem que MOSTRAR as marcas, não listar
   * nomes. Duas têm arquivo oficial e duas têm wordmark inline, e todas precisam sair
   * com nome acessível, senão quem usa leitor de tela recebe uma página de logos mudos.
   */
  it("mostra o logo das quatro marcas, cada um com nome acessível", () => {
    const { container } = renderPage();

    for (const m of MARCAS) {
      expect(screen.getAllByRole("img", { name: m.nome }).length).toBeGreaterThan(0);
    }
    // Os dois arquivos oficiais, servidos pelo próprio site.
    expect(container.querySelector('img[src="/brand/logo-movepark.svg"]')).toBeTruthy();
    expect(container.querySelector('img[src="/brand/logo-go2park.png"]')).toBeTruthy();
  });

  it("traz a ilustração do hero com dimensão declarada, para não pular no carregamento", () => {
    const { container } = renderPage();
    const ilu = container.querySelector('img[src="/images/grupo-ecossistema.webp"]');

    expect(ilu).toBeTruthy();
    expect(ilu).toHaveAttribute("width");
    expect(ilu).toHaveAttribute("height");
    expect(ilu?.getAttribute("alt")).toMatch(/van/i);
  });

  it("declara o estágio no cartão de cada marca, com o detalhe ao lado", () => {
    const { container } = renderPage();

    for (const m of MARCAS) {
      const card = within(container.querySelector(`article#${m.id}`) as HTMLElement);
      expect(card.getByText(ESTAGIO_ROTULO[m.estagio]), m.nome).toBeInTheDocument();
      expect(card.getByText(m.estagioDetalhe), m.nome).toBeInTheDocument();
    }

    // Produto que ainda não dá para contratar precisa dizer isso, não só "em
    // desenvolvimento": o rótulo sozinho deixa a leitura de "já dá para pedir".
    const emDev = MARCAS.filter((m) => m.estagio === "em-desenvolvimento");
    expect(emDev).toHaveLength(2);
    for (const m of emDev) {
      expect(m.estagioDetalhe).toMatch(/não está disponível para contratação/i);
    }
  });

  it("nomeia quem fatura cada marca, com o CNPJ da Movepark", () => {
    renderPage();

    for (const r of RESPONSAVEIS) {
      expect(screen.getByText(r.razao)).toBeInTheDocument();
    }
    expect(screen.getByText(/68\.183\.164\/0001-35/)).toBeInTheDocument();
    // A Go2Park fatura pela Fera hoje, e a página diz isso (ADR do grupo, §3).
    expect(screen.getByText(/até a titularidade passar/i)).toBeInTheDocument();
  });

  it("leva ao site do Go2Park sem nofollow", () => {
    renderPage();

    const link = screen.getByRole("link", { name: /go2park\.com\.br/i });
    expect(link).toHaveAttribute("href", "https://go2park.com.br");
    expect(link.getAttribute("rel") ?? "").not.toContain("nofollow");
  });

  it("tem um cartão por marca, cada um com âncora própria", () => {
    const { container } = renderPage();

    for (const m of MARCAS) {
      const card = container.querySelector(`article#${m.id}`);
      expect(card, m.id).toBeTruthy();
      expect(within(card as HTMLElement).getByRole("heading", { level: 3 })).toHaveTextContent(
        m.nome,
      );
    }
  });
});

describe("as marcas no dado estruturado", () => {
  it("saem como `brand`, na mesma ordem da tela", () => {
    const s = organizationSchema() as Record<string, unknown>;
    const brand = s.brand as { "@type": string; name: string; url: string }[];

    expect(brand.map((b) => b.name)).toEqual(MARCAS.map((m) => m.nome));
    expect(brand.every((b) => b["@type"] === "Brand")).toBe(true);
    expect(brand.find((b) => b.name === "Go2Park")?.url).toBe("https://go2park.com.br");
  });

  /**
   * A trava da ADR do grupo (docs/specs/grupo-movepark.md §3): enquanto a Go2Park faturar
   * pelo CNPJ da Agência Fera, o schema não pode afirmar sociedade. Este teste falha no
   * dia em que alguém promover `brand` a `subOrganization` sem passar pela decisão, que é
   * exatamente quando ninguém lembraria do motivo.
   */
  it("não afirma estrutura societária que o contrato social não sustenta", () => {
    const s = organizationSchema() as Record<string, unknown>;

    expect(s.subOrganization).toBeUndefined();
    expect(s.parentOrganization).toBeUndefined();
    expect(s.owns).toBeUndefined();
  });
});

/**
 * O gêmeo Markdown é escrito à mão (o gerador de artefatos só cobre FAQ, preços, destinos
 * e blog). Escrito à mão é escrito uma vez e esquecido na segunda edição, então o que
 * impede a divergência é este teste, e não a boa vontade de quem editar.
 */
describe("public/grupo.md", () => {
  const md = readFileSync(join(process.cwd(), "public", "grupo.md"), "utf8");

  it("tem uma seção por marca, com o resumo e cada parágrafo do cartão", () => {
    for (const m of MARCAS) {
      expect(md, m.nome).toContain(`## ${m.nome}`);
      expect(md, m.nome).toContain(m.resumo);
      for (const p of m.paragrafos) expect(md, m.nome).toContain(p);
    }
  });

  it("repete o estágio e quem responde por cada marca", () => {
    for (const m of MARCAS) expect(md).toContain(m.estagioDetalhe);
    for (const r of RESPONSAVEIS) expect(md).toContain(r.razao);
    expect(md).toContain("68.183.164/0001-35");
  });
});
