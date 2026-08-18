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
