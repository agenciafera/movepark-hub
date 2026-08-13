import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { ConsumerMobileMenu } from "./ConsumerMobileMenu";

/**
 * O menu é a navegação do mobile desde que a barra fixa de baixo saiu, e vale
 * logado e deslogado.
 */
describe("ConsumerMobileMenu", () => {
  it("abre pelo botão do canto e lista os links principais", async () => {
    renderWithProviders(<ConsumerMobileMenu />);

    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    const destinos = ["/destinos", "/como-funciona", "/blog/", "/ajuda", "/seja-parceiro"];
    for (const href of destinos) {
      expect(screen.getByRole("link", { name: rotuloDe(href) })).toHaveAttribute("href", href);
    }
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
    const { container } = renderWithProviders(<ConsumerMobileMenu />, { route: "/destinos" });
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    for (const item of container.ownerDocument.querySelectorAll("nav a")) {
      expect(item.className).not.toContain("=>");
      expect(item.className).toContain("min-h-11");
    }
  });

  /** Sem a marca, o leitor não sabe em que seção está. */
  it("marca a seção atual, e só ela", async () => {
    const { container } = renderWithProviders(<ConsumerMobileMenu />, { route: "/destinos" });
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

  /** Numa lista de oito itens o ícone é o que deixa o dedo achar o alvo. */
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

function rotuloDe(href: string) {
  return {
    "/destinos": "Destinos",
    "/como-funciona": "Como funciona",
    "/blog/": "Blog",
    "/ajuda": "Ajuda",
    "/seja-parceiro": "Seja parceiro",
  }[href]!;
}
