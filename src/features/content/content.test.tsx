import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { BlockView } from "./Blocks";
import { ContentPageView } from "./ContentPageView";
import { formatUpdated, readingMinutes, type Section } from "./types";
import { faqJsonLd } from "./jsonld";
import { CANCELAMENTO } from "./pages";

const SECOES: Section[] = [
  { id: "um", title: "Primeira seção", blocks: [{ type: "p", text: "Texto da primeira." }] },
  { id: "dois", title: "Segunda seção", blocks: [{ type: "p", text: "Texto da segunda." }] },
];

function montar(sections: Section[] = SECOES) {
  return render(
    <MemoryRouter>
      <ContentPageView
        label="Documento"
        title="Título do documento"
        intro="Intro do documento."
        updated="2026-08-10"
        readMinutes={4}
        sections={sections}
      />
    </MemoryRouter>,
  );
}

describe("formatUpdated", () => {
  /**
   * Regressão: `new Date("2026-08-10")` é meia-noite UTC, e formatar no fuso do
   * Brasil devolvia o dia 9. Documento revisado dia 10 aparecia como 9.
   */
  it("data só de dia não volta um dia no fuso do Brasil", () => {
    expect(formatUpdated("2026-08-10")).toBe("10 de agosto de 2026");
  });

  it("data com hora continua sendo respeitada", () => {
    expect(formatUpdated("2026-08-10T15:00:00Z")).toMatch(/10 de agosto de 2026/);
  });
});

describe("readingMinutes", () => {
  it("conta o texto de todos os tipos de bloco, com mínimo de 1", () => {
    expect(readingMinutes([])).toBe(1);
    expect(readingMinutes(CANCELAMENTO.sections)).toBeGreaterThanOrEqual(1);
  });
});

describe("ContentPageView", () => {
  it("monta migalha, título, intro e a linha de contexto", () => {
    montar();
    expect(screen.getByRole("heading", { level: 1, name: "Título do documento" })).toBeInTheDocument();
    expect(screen.getByText("Intro do documento.")).toBeInTheDocument();
    expect(screen.getByText("10 de agosto de 2026")).toBeInTheDocument();
    expect(screen.getByText(/4 min de leitura/)).toBeInTheDocument();
    expect(screen.getByText(/2 seções/)).toBeInTheDocument();
  });

  /** Deep link tem que dar pra copiar, então o índice é de âncoras, não de botões. */
  it("o índice usa âncoras que batem com o id das seções", () => {
    const { container } = montar();
    const indice = container.querySelector('nav[aria-label="Nesta página"]');
    const hrefs = [...(indice?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["#um", "#dois"]);
    expect(container.querySelector("section#um")).toBeInTheDocument();
  });

  /**
   * O índice tinha um botão de imprimir que ninguém sabia explicar, e página de
   * conteúdo não é documento pra levar no papel. Quem quiser imprimir usa o
   * próprio navegador, e as regras `print:hidden` limpam o resultado.
   */
  it("o índice não oferece impressão", () => {
    const { container } = montar();
    const indice = container.querySelector('nav[aria-label="Nesta página"]')!;
    expect(indice.querySelector("button")).toBeNull();
    expect(screen.queryByRole("button", { name: /imprimir/i })).toBeNull();
  });

  it("com uma seção só, não há índice pra navegar", () => {
    const { container } = montar([SECOES[0]]);
    expect(container.querySelector('nav[aria-label="Nesta página"]')).toBeNull();
  });

  /**
   * Regressão: a coluna do conteúdo é flex item e, sem `flex-1`, encolhia até o
   * conteúdo. Bloco de linha curta (accordion, tabela) ficava mais estreito que a
   * medida de leitura e a régua parava no meio da página.
   */
  it("a coluna do conteúdo ocupa a medida de leitura, não a largura do texto", () => {
    const { container } = montar();
    const coluna = container.querySelector("section#um h2")!.parentElement!;
    expect(coluna.className).toContain("flex-1");
    expect(coluna.className).toContain("max-w-[68ch]");
  });

  it("a saída de suporte fica em toda página", () => {
    montar();
    expect(screen.getByText("Ficou alguma dúvida?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fale conosco" })).toHaveAttribute("href", "/contato");
  });
});

describe("blocos", () => {
  it("o accordion do FAQ abre um por vez e é anunciado", async () => {
    const user = userEvent.setup();
    render(
      <BlockView
        block={{
          type: "faq",
          items: [
            { q: "Primeira pergunta?", a: "Primeira resposta." },
            { q: "Segunda pergunta?", a: "Segunda resposta." },
          ],
        }}
      />,
    );

    const p1 = screen.getByRole("button", { name: "Primeira pergunta?" });
    const p2 = screen.getByRole("button", { name: "Segunda pergunta?" });
    expect(p1).toHaveAttribute("aria-expanded", "false");

    await user.click(p1);
    expect(p1).toHaveAttribute("aria-expanded", "true");

    await user.click(p2);
    expect(p2).toHaveAttribute("aria-expanded", "true");
    expect(p1).toHaveAttribute("aria-expanded", "false");
  });

  it("a tabela vira par de chave e valor", () => {
    const { container } = render(
      <BlockView block={{ type: "table", rows: [{ k: "Básica", v: "24 horas antes" }] }} />,
    );
    const linha = container.querySelector("dl > div")!;
    expect(within(linha as HTMLElement).getByText("Básica").tagName).toBe("DT");
    expect(within(linha as HTMLElement).getByText("24 horas antes").tagName).toBe("DD");
  });
});

describe("structured data", () => {
  /** O Google penaliza schema que diverge do visível, então sai dos mesmos blocos. */
  it("o FAQPage junta os blocos de FAQ da página inteira", () => {
    const schema = faqJsonLd(CANCELAMENTO.sections);
    expect(schema?.mainEntity).toHaveLength(4);
    expect(schema?.mainEntity[0].name).toBe("Como cancelo minha reserva?");
  });

  it("página sem FAQ não emite schema vazio", () => {
    expect(faqJsonLd(SECOES)).toBeNull();
  });
});
