import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ConsumerFooter } from "./ConsumerFooter";

describe("ConsumerFooter — links", () => {
  it("aponta 'Como funciona' e 'Política de cancelamento' para as rotas reais (não sob /ajuda)", () => {
    renderWithProviders(<ConsumerFooter />);

    const comoFunciona = screen.getByRole("link", { name: "Como funciona" });
    expect(comoFunciona).toHaveAttribute("href", "/como-funciona");

    const cancelamento = screen.getByRole("link", { name: "Política de cancelamento" });
    expect(cancelamento).toHaveAttribute("href", "/cancelamento");
  });

  it("o Blog aponta para a URL com barra final, que é a canônica herdada do WordPress", () => {
    // Sem a barra o worker devolve 301, e o rodapé aparece em toda página do site:
    // seria um salto de redirect em cada visita ao blog.
    renderWithProviders(<ConsumerFooter />);

    expect(screen.getByRole("link", { name: "Blog" })).toHaveAttribute("href", "/blog/");
  });

  it("a chamada pro FAQ leva à central de perguntas", () => {
    renderWithProviders(<ConsumerFooter />);

    expect(screen.getByText("Dúvidas sobre estacionamento de aeroporto?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver perguntas frequentes" })).toHaveAttribute(
      "href",
      "/faq",
    );
  });
});

describe("ConsumerFooter — as colunas", () => {
  /**
   * As duas primeiras colunas nomeiam público, e não assunto, porque é o público que
   * separa B2C de B2B: sem isso, "Seja parceiro" parecia oferta pra quem ia viajar. A
   * ordem e os rótulos são os mesmos do menu do celular, para as duas superfícies
   * contarem a mesma história.
   */
  it("abre por público, na mesma ordem do menu do celular", () => {
    renderWithProviders(<ConsumerFooter />);

    const titulos = screen
      .getByRole("contentinfo")
      .querySelectorAll("h4");
    expect([...titulos].map((t) => t.textContent)).toEqual([
      "Para quem viaja",
      "Para donos de estacionamento",
      "Movepark",
      "Suporte",
    ]);
  });

  /** O catálogo não tinha link no rodapé: só se chegava nele pelo header. */
  it("leva o catálogo de estacionamentos, sob a placa de quem viaja", () => {
    renderWithProviders(<ConsumerFooter />);

    const link = screen.getByRole("link", { name: "Estacionamentos" });
    expect(link).toHaveAttribute("href", "/estacionamentos");
    expect(link.closest("div")?.querySelector("h4")?.textContent).toBe("Para quem viaja");
  });
});

describe("ConsumerFooter — a faixa da chamada", () => {
  /**
   * A pergunta media 16px, o mesmo da linha de apoio logo abaixo, e a faixa lia
   * como dois parágrafos sem um começo.
   */
  it("a pergunta é maior que a linha de apoio", () => {
    renderWithProviders(<ConsumerFooter />);

    const pergunta = screen.getByText("Dúvidas sobre estacionamento de aeroporto?");
    expect(pergunta.className).toContain("text-display-md");
    expect(pergunta.className).not.toContain("text-title-md");
  });

  /**
   * O botão era branco cheio: virava a coisa mais clara da faixa e puxava o olho
   * antes da pergunta que ele responde. Sobre cor, o botão é só borda.
   */
  it("o botão é só borda, sem preenchimento branco", () => {
    renderWithProviders(<ConsumerFooter />);

    const botao = screen.getByRole("link", { name: "Ver perguntas frequentes" });
    expect(botao.className).toContain("bg-transparent");
    expect(botao.className).toContain("border-white/50");
    // Por classe, e não por substring: `hover:bg-white/10` é o realce do toque,
    // não o preenchimento.
    expect(botao.className.split(" ")).not.toContain("bg-white");
  });
});
