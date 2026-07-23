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
    // Sobe até o card inteiro (marcado com data-reveal-card), não o wrapper
    // `text-center` do cabeçalho, que não contém a pilha de comprovantes.
    return screen
      .getByRole("heading", { name: /Vaga vazia não volta/i })
      .closest("[data-reveal-card]")!;
  }

  it("empilha os comprovantes sobrepostos e tortos", () => {
    // É a sobreposição que faz a leitura de "papelada acumulada". Sem a margem
    // negativa vira uma lista comum, e sem o giro vira uma pilha de cartões.
    renderPage();

    const tickets = [...cardDor().querySelectorAll<HTMLLIElement>("ul > li")];
    expect(tickets).toHaveLength(4);
    expect(tickets[0].style.marginTop).toBe("0px");
    for (const t of tickets.slice(1)) expect(t.style.marginTop).toBe("-20px");
    // O giro fica no filho do <li> (o <li> é só posição/queda; o rotate ali seria
    // apagado pelo gsap ao assumir o transform na animação de cair).
    for (const t of tickets) {
      const card = t.firstElementChild as HTMLElement;
      expect(card.style.transform).toMatch(/rotate\(-?[\d.]+deg\)/);
    }
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

describe("SejaParceiroPage — como funciona", () => {
  it("mostra os três passos com título e barra de destaque", () => {
    renderPage();

    const passos = [...document.querySelectorAll("li[data-step]")];
    expect(passos).toHaveLength(3);
    expect(screen.getByRole("heading", { name: /Cadastro rápido/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Suas vagas no ar/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Dinheiro na conta/i })).toBeInTheDocument();
  });

  it("o primeiro passo entra em foco por padrão, sem desbotar", () => {
    // O foco (ativo) muda com o scroll; sem scroll, o passo 1 é o ativo e não
    // pode estar desbotado. É o conteúdo do primeiro passo que precisa estar
    // sempre legível ao abrir a página.
    renderPage();

    const primeiro = document.querySelector('li[data-step="0"]')!;
    const conteudo = primeiro.querySelector("div")!;
    expect(conteudo.className).not.toContain("opacity-40");
  });

  it("o card verde de aprovação flutua sobre a foto", () => {
    renderPage();
    expect(screen.getByText("Cadastro aprovado!")).toBeInTheDocument();
  });
});

describe("SejaParceiroPage — depoimentos", () => {
  it("traz dois depoimentos em destaque e três compactos, cada um com o logo do lote", () => {
    // Escopado ao <figure>: a faixa de parceiros no rodapé da página repete os
    // mesmos nomes, e uma busca global casaria com ela em vez do depoimento.
    // A ordem no DOM é os dois featured primeiro, depois os três compactos.
    renderPage();

    const cards = [...document.querySelectorAll("figure")];
    expect(cards).toHaveLength(5);
    expect(cards.map((c) => c.querySelector("img")?.getAttribute("alt"))).toEqual([
      "Virapark",
      "Garage Inn",
      "Nation Park",
      "Aerovalet",
      "Aeropark",
    ]);
  });

  it("não afirma número de performance sem lastro", () => {
    // Guarda contra o mockup, que trazia "24% de conversão" e "R$ 550k+ de
    // faturamento". Não temos essa medição; número inventado aqui vira cobrança
    // do parceiro na primeira reunião.
    renderPage();

    expect(document.body.textContent).not.toMatch(/\d+%\s*de\s*convers/i);
    expect(document.body.textContent).not.toMatch(/R\$\s*\d+\s*k/i);
  });
});

describe("SejaParceiroPage — CTA final", () => {
  it("grifa 'encher suas vagas' com banda clara e texto legível", () => {
    // O grifo usa banda pale + texto ink (não violeta, que é reservado a
    // acionável). O HighlightSweep renderiza o texto duas vezes (base branca +
    // overlay pintado), então buscamos a camada pintada entre os matches.
    renderPage();

    const matches = screen.getAllByText("encher suas vagas?");
    const grifo = matches.find((el) => el.className.includes("bg-mp-pale"));
    expect(grifo).toBeTruthy();
    expect(grifo!.className).toContain("text-ink");
    for (const el of matches) expect(el.className).not.toContain("bg-mp-primary");
  });
});

describe("SejaParceiroPage — landing de parceiro", () => {
  it("mostra promessa, métricas e FAQ", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /sem custo pra começar/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("o cliente paga antes de chegar")).toBeInTheDocument();
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
