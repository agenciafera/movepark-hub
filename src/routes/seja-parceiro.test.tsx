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

describe("SejaParceiroPage — par de cards dor/resposta", () => {
  function cardDor() {
    return screen.getByRole("heading", { name: /Vaga vazia não volta/i }).closest("div")!;
  }

  it("empilha os comprovantes sobrepostos e tortos", () => {
    // É a sobreposição que faz a leitura de "papelada acumulada". Sem a margem
    // negativa vira uma lista comum, e sem o giro vira uma pilha de cartões.
    renderPage();

    const tickets = [...cardDor().querySelectorAll<HTMLLIElement>("ul > li")];
    expect(tickets).toHaveLength(4);
    expect(tickets[0].style.marginTop).toBe("0px");
    for (const t of tickets.slice(1)) expect(t.style.marginTop).toBe("-20px");
    for (const t of tickets) expect(t.style.transform).toMatch(/rotate\(-?[\d.]+deg\)/);
  });

  it("cada comprovante empilha acima do anterior", () => {
    // Sem z-index crescente o de baixo apareceria por cima e a pilha inverteria.
    renderPage();

    const z = [...cardDor().querySelectorAll<HTMLLIElement>("ul > li")].map((t) =>
      Number(t.style.zIndex),
    );
    expect(z).toEqual([...z].sort((a, b) => a - b));
    expect(new Set(z).size).toBe(z.length);
  });

  it("o X é vermelho e decorativo", () => {
    renderPage();

    const icone = cardDor().querySelector("svg")!;
    expect(icone.getAttribute("aria-hidden")).toBe("true");
    expect(icone.closest("span")!.className).toContain("bg-mp-red");
  });

  it("a fatura zera todas as linhas e o total", () => {
    // É a prova literal do "sem botar nada do bolso": se alguma linha deixar de ser
    // zero, a promessa da seção deixa de ser verdade.
    renderPage();

    for (const linha of ["Mensalidade", "Taxa de adesão", "Anúncio e mídia"]) {
      expect(screen.getByText(linha)).toBeInTheDocument();
    }
    expect(screen.getByText("Você paga")).toBeInTheDocument();
    expect(screen.getAllByText("R$ 0,00")).toHaveLength(4);
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
