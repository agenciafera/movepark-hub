import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { ConsumerMobileMenu } from "./ConsumerMobileMenu";
import { ConsumerFooter } from "./ConsumerFooter";

/**
 * O menu é a navegação do mobile desde que a barra fixa de baixo saiu, e vale
 * logado e deslogado.
 */
describe("ConsumerMobileMenu", () => {
  it("abre pelo botão do canto e lista os links principais", async () => {
    renderWithProviders(<ConsumerMobileMenu />);

    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    for (const [href, rotulo] of Object.entries(LINKS_ESPERADOS)) {
      expect(screen.getByRole("link", { name: rotulo })).toHaveAttribute("href", href);
    }
  });

  /**
   * O menu nasceu com cinco links, quando metade destas páginas não existia, e
   * quem estava no celular só chegava em preços, calculadora, cancelamento ou
   * contato rolando a página até o rodapé. Agora ele é o rodapé, item por item, e
   * este teste é o que impede as duas listas de divergirem de novo: ao acrescentar
   * um link no rodapé, ele tem que aparecer aqui no mesmo commit.
   */
  it("leva todo link do rodapé, com o mesmo rótulo e o mesmo grupo", async () => {
    renderWithProviders(
      <>
        <ConsumerMobileMenu />
        <ConsumerFooter />
      </>,
    );
    // Só as listas dos grupos: a chamada do topo e a marca do rodapé não são
    // navegação de seção.
    const noRodape = [...screen.getByRole("contentinfo").querySelectorAll("ul a")].map(
      (a) => [a.getAttribute("href"), a.textContent] as const,
    );
    expect(noRodape.length).toBeGreaterThan(10);

    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    for (const [href, rotulo] of noRodape) {
      expect(screen.getByRole("link", { name: rotulo! })).toHaveAttribute("href", href!);
    }
  });

  /** O título é o que deixa o polegar parar de rolar no bloco certo. */
  it("agrupa os links com os mesmos títulos do rodapé", async () => {
    renderWithProviders(<ConsumerMobileMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    const grupos = screen.getAllByRole("group");
    expect(grupos.map((g) => g.textContent?.slice(0, 20))).toEqual([
      expect.stringContaining("Movepark"),
      expect.stringContaining("Estacionamentos"),
      expect.stringContaining("Suporte"),
    ]);
    // "Destinos" fica solto acima dos grupos: é o motivo de alguém abrir o site.
    for (const g of grupos) expect(g).not.toHaveTextContent("Destinos");
  });

  /**
   * O rodapé mostra "Painel do estacionamento" pro parceiro que ainda não entrou.
   * Quem já opera recebe "Ir pro Operator" no bloco da conta, e os dois levam ao
   * mesmo /operator: repetido, o link ainda acenderia duas vezes como seção atual.
   */
  it("não repete o /operator pra quem já opera", async () => {
    renderWithProviders(<ConsumerMobileMenu />, {
      auth: mockAuth({
        session: mockSession("company_operator"),
        effectiveRole: "company_operator",
      }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    expect(screen.getByRole("link", { name: "Ir pro Operator" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Painel do estacionamento" })).toBeNull();
  });

  /** Sem sessão o "Entrar" saiu do header no mobile: ele mora aqui dentro. */
  it("leva o Entrar, que saiu do header no mobile", async () => {
    renderWithProviders(<ConsumerMobileMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login");
  });

  /**
   * O avatar do header abria um dropdown de conta ao lado deste menu: dois botões
   * colados, cada um com metade dos destinos e nenhum com tudo. Agora o gatilho é
   * um só, e é aqui que a conta e o site convivem.
   */
  it("com sessão, a conta entra no mesmo painel dos links do site", async () => {
    renderWithProviders(<ConsumerMobileMenu />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    for (const nome of ["Minhas reservas", "Favoritos", "Indique e ganhe"]) {
      expect(screen.getByRole("link", { name: nome })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Destinos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Seja parceiro" })).toBeInTheDocument();
    // Quem já entrou tem "Sair", não "Entrar".
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
  });

  /** O avatar sozinho não dizia de quem era a conta nem levava a ela. */
  it("com sessão, o topo identifica quem entrou e leva para a conta", async () => {
    renderWithProviders(<ConsumerMobileMenu />, {
      auth: mockAuth({ session: mockSession("customer", { firstName: "Diego" }) }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    const identidade = screen.getByRole("link", { name: /Diego/ });
    expect(identidade).toHaveAttribute("href", "/account");
    expect(identidade).toHaveTextContent("Ver conta");
  });

  /**
   * O papel do usuário decide o atalho de painel: sem isso, um hub_admin no
   * celular não tem por onde chegar ao Manager.
   */
  it("hub_admin ganha o atalho do Manager, e o cliente não", async () => {
    const { unmount } = renderWithProviders(<ConsumerMobileMenu />, {
      auth: mockAuth({
        session: mockSession("hub_admin"),
        effectiveRole: "hub_admin",
      }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    expect(screen.getByRole("link", { name: "Ir pro Manager" })).toHaveAttribute(
      "href",
      "/manager",
    );
    unmount();

    renderWithProviders(<ConsumerMobileMenu />, {
      auth: mockAuth({ session: mockSession("customer"), effectiveRole: "customer" }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    expect(screen.queryByRole("link", { name: "Ir pro Manager" })).toBeNull();
  });

  /**
   * Regressão: o `NavLink` recebe `className` como função, e dentro de
   * `SheetClose asChild` o Slot do Radix concatena `className` como string. A
   * função ia parar no DOM como o próprio código-fonte, e o item perdia toda a
   * estilização sem erro nenhum no console.
   */
  it("a classe do item é string, nunca o código de uma função", async () => {
    const { container } = renderWithProviders(<ConsumerMobileMenu />, { route: "/estacionamentos" });
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    for (const item of container.ownerDocument.querySelectorAll("nav a")) {
      expect(item.className).not.toContain("=>");
      expect(item.className).toContain("min-h-11");
    }
  });

  /** Sem a marca, o leitor não sabe em que seção está. */
  it("marca a seção atual, e só ela", async () => {
    const { container } = renderWithProviders(<ConsumerMobileMenu />, { route: "/estacionamentos" });
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    const marcados = [...container.ownerDocument.querySelectorAll("nav a[aria-current='page']")];
    expect(marcados).toHaveLength(1);
    expect(marcados[0]).toHaveTextContent("Destinos");
    expect(marcados[0].className).toContain("text-mp-primary");
  });

  /**
   * O violeta é o da seleção. Com todos os ícones em violeta, nenhum item se
   * destacaria, então os demais ficam no índigo que a lista da conta já usa.
   */
  it("só o ícone do item atual é violeta; os outros são índigo", async () => {
    const { container } = renderWithProviders(<ConsumerMobileMenu />, { route: "/ajuda" });
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    const violetas = [...container.ownerDocument.querySelectorAll("nav a svg.text-mp-primary")];
    const indigos = [...container.ownerDocument.querySelectorAll("nav a svg.text-mp-indigo")];
    expect(violetas).toHaveLength(1);
    expect(indigos.length).toBeGreaterThan(3);
  });

  /** Numa lista longa o ícone é o que deixa o dedo achar o alvo. */
  it("todo item da lista tem ícone", async () => {
    const { container } = renderWithProviders(<ConsumerMobileMenu />, {
      auth: mockAuth({ session: mockSession("customer") }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    const itens = [...container.ownerDocument.querySelectorAll("nav a")];
    expect(itens.length).toBeGreaterThan(5);
    for (const item of itens) expect(item.querySelector("svg")).not.toBeNull();
  });

  /**
   * O ícone é feito de três traços, e não de dois desenhos trocados, porque
   * troca não tem meio do caminho: o ícone piscaria. Os dois eixos entram sempre,
   * mesmo valendo zero, senão o transform composto fica preso no valor antigo e
   * o traço se desloca sem girar.
   */
  it("os traços do menu viram X quando o painel abre", async () => {
    const { container } = renderWithProviders(<ConsumerMobileMenu />);
    const gatilho = screen.getByRole("button", { name: "Abrir menu" });
    const tracos = () => [...gatilho.querySelectorAll("span span")].map((t) => t.className);

    const [topoFechado, meioFechado, baseFechado] = tracos();
    expect(topoFechado).toContain("rotate-0");
    expect(topoFechado).toContain("-translate-y-[5px]");
    expect(meioFechado).toContain("opacity-100");
    expect(baseFechado).toContain("rotate-0");
    expect(baseFechado).toContain("translate-y-[5px]");

    await userEvent.click(gatilho);

    const [topo, meio, base] = tracos();
    expect(topo).toContain("rotate-45");
    expect(topo).toContain("translate-y-0");
    expect(meio).toContain("opacity-0");
    expect(base).toContain("-rotate-45");
    expect(base).toContain("translate-y-0");
    expect(container).toBeTruthy();
  });

  /** O padrão do plugin (150ms) fazia o painel aparecer estalado. */
  it("o painel abre mais devagar do que fecha", async () => {
    renderWithProviders(<ConsumerMobileMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    const painel = screen.getByRole("dialog");
    expect(painel.className).toContain("data-[state=open]:[animation-duration:300ms]");
    expect(painel.className).toContain("data-[state=closed]:[animation-duration:200ms]");
  });

  /** A virada é em 1128: abaixo disso o header não comporta a busca inteira. */
  it("o gatilho some só a partir do desktop", () => {
    renderWithProviders(<ConsumerMobileMenu />);
    expect(screen.getByRole("button", { name: "Abrir menu" }).className).toContain(
      "desktop:hidden",
    );
  });

  /**
   * O foco automático do Radix caía no botão de tema, o último controle do
   * painel, e abrir o menu acendia um anel num alvo que ninguém escolheu.
   */
  it("ao abrir, o foco fica no painel, e a primeira tabulação é o topo da lista", async () => {
    renderWithProviders(<ConsumerMobileMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    const painel = screen.getByRole("dialog");
    expect(document.activeElement).toBe(painel);

    const tabaveis = [...painel.querySelectorAll<HTMLElement>("a[href], button")];
    expect(tabaveis[0]).toHaveTextContent("Destinos");
  });

  /** Régua entre itens de lista curta divide o que o espaço já separa. */
  it("os itens não têm régua e o texto recua junto com o título", async () => {
    renderWithProviders(<ConsumerMobileMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    const item = screen.getByRole("link", { name: "Destinos" });
    expect(item.className).not.toContain("border-b");
    expect(item.className).toContain("px-3");
  });
});

const LINKS_ESPERADOS: Record<string, string> = {
  "/estacionamentos": "Destinos",
  "/sobre": "Sobre nós",
  "/blog/": "Blog",
  "/precos": "Índice de preços",
  "/calculadora-estacionamento-aeroporto": "Calculadora de estacionamento",
  "/termos": "Termos de uso",
  "/privacidade": "Política de privacidade",
  "/seja-parceiro": "Seja parceiro",
  "/operator": "Painel do estacionamento",
  "/ajuda": "Central de ajuda",
  "/faq": "Perguntas frequentes",
  "/como-funciona": "Como funciona",
  "/cancelamento": "Política de cancelamento",
  "/contato": "Fale conosco",
};
