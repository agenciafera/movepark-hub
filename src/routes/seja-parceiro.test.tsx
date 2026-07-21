import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import SejaParceiroPage from "@/routes/seja-parceiro";

function renderPage() {
  renderWithProviders(
    <HelmetProvider>
      <SejaParceiroPage />
    </HelmetProvider>,
  );
}

describe("SejaParceiroPage — bloco de dor (pilha de cards)", () => {
  function cards() {
    const titulo = screen.getByRole("heading", { name: /Vaga vazia não volta/i });
    const lista = titulo.closest("section")!.querySelector("ul")!;
    return [...lista.querySelectorAll<HTMLLIElement>(":scope > li")];
  }

  it("cada card gruda um degrau abaixo do anterior", () => {
    // É o degrau que deixa a borda do card de baixo aparecendo na pilha. Sem ele os
    // cards se cobrem por inteiro e o efeito some.
    renderPage();

    const tops = cards().map((li) => li.style.top);
    expect(tops).toEqual(["96px", "110px", "124px", "138px"]);
    for (const li of cards()) expect(li.className).toContain("sticky");
  });

  it("todos os cards têm a mesma altura mínima", () => {
    // A pilha não é grid, então não existe linha pra igualar altura: o `min-h` é o
    // que mantém os quatro do tamanho do maior.
    renderPage();

    const alturas = new Set(
      cards().map((li) => li.querySelector("div")!.className.match(/min-h-\[\d+px\]/)?.[0]),
    );
    expect(alturas.size).toBe(1);
    expect([...alturas][0]).toBeDefined();
  });

  it("o X é grande e na cor de erro da marca, decorativo", () => {
    renderPage();

    const icone = cards()[0].querySelector("svg")!;
    expect(icone.getAttribute("class")).toContain("text-mp-red");
    expect(icone.getAttribute("class")).toContain("h-8");
    // O texto ao lado já diz a dor; o ícone não deve ser lido de novo.
    expect(icone.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("SejaParceiroPage — landing de parceiro", () => {
  it("mostra promessa, métricas e FAQ", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /sem custo pra começar/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("das reservas pagas com antecedência")).toBeInTheDocument();
    expect(screen.getByText(/Quanto custa para ser parceiro/i)).toBeInTheDocument();
  });

  it("não tem formulário inline; os CTAs abrem o modal de cadastro", async () => {
    renderPage();
    // Formulário não fica visível na página (só via modal).
    expect(screen.queryByText("Passo 1 de 2")).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: /Quero ser parceiro/i })[0]);

    expect(await screen.findByText("Passo 1 de 2")).toBeInTheDocument();
  });
});
