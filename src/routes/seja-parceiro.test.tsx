import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import SejaParceiroPage from "@/routes/seja-parceiro";

// O iframe do YouTube some do render de teste: o happy-dom lança ao conectar um
// iframe (page loading desabilitado), e a rejeição não capturada fazia o gate piscar.
vi.mock("@/components/shared/YouTubeEmbed", () => ({ YouTubeEmbed: () => null }));

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

  it("o card de aprovação flutua sobre a foto", () => {
    renderPage();
    expect(screen.getByText("Cadastro aprovado!")).toBeInTheDocument();
  });

  /**
   * Regressão de 19/08/2026: o bloco "Como funciona" reusava a foto do hero, e a
   * mesma imagem duas vezes na página fazia a seção parecer eco do topo.
   */
  it("a foto dos passos não é a mesma do hero", () => {
    renderPage();

    const fotos = [...document.querySelectorAll("img")]
      .map((img) => img.getAttribute("src"))
      .filter((src): src is string => Boolean(src?.startsWith("/images/seja-parceiro")));

    expect(fotos.length).toBeGreaterThanOrEqual(2);
    expect(new Set(fotos).size).toBe(fotos.length);
  });

  /**
   * O verde do card fica só no ícone. Contorno e sombra são neutros: sobre a foto
   * o card precisa parecer levantado, não iluminado de verde.
   */
  it("o card de aprovação tem contorno e sombra neutros", () => {
    renderPage();

    const card = screen.getByText("Cadastro aprovado!").closest("div.absolute")!;
    expect(card.className).toContain("border-hairline");
    expect(card.className).not.toContain("border-green");
    expect(card.className).not.toMatch(/shadow-\[[^\]]*rgba\(34,197,94/);
  });
});

describe("SejaParceiroPage — depoimentos", () => {
  /**
   * Bento de 17/08/2026: o primeiro depoimento ocupa duas linhas da grade e os
   * outros quatro ficam ao lado. O desenho anterior tinha dois cards grandes
   * lado a lado, e dois destaques não destacam nada.
   */
  it("o primeiro depoimento domina a grade, e só ele", () => {
    renderPage();

    const cards = [...document.querySelectorAll("figure")];
    expect(cards[0].className).toContain("tablet:row-span-2");
    for (const outro of cards.slice(1)) {
      expect(outro.className).not.toContain("row-span-2");
    }
  });

  /**
   * As citações são ilustrativas até virem as reais. Foto de banco de imagem
   * daria cara e nome a alguém que não falou aquilo, então o rosto é a inicial.
   */
  it("as assinaturas não usam foto de pessoa", () => {
    renderPage();

    const cards = [...document.querySelectorAll("figure")];
    for (const card of cards) {
      const legenda = card.querySelector("figcaption")!;
      expect(legenda.querySelector("img")).toBeNull();
      expect(legenda.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * O projeto só tem `tablet` (744) e `desktop` (1128). A referência que
   * originou o bento vinha com `md:`/`lg:`, que aqui não existem e sairiam do
   * CSS sem erro nenhum, deixando a grade sempre em uma coluna.
   */
  it("a grade usa os breakpoints do projeto", () => {
    renderPage();

    const grade = document.querySelector("figure")!.parentElement!;
    expect(grade.className).toContain("tablet:grid-cols-2");
    expect(grade.className).not.toMatch(/\b(md|lg|sm|xl):/);
  });

  it("traz cinco depoimentos, cada um com o logo do lote", () => {
    // Escopado ao <figure>: a faixa de parceiros no rodapé da página repete os
    // mesmos nomes, e uma busca global casaria com ela em vez do depoimento.
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
