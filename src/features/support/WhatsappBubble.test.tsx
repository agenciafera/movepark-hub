import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { WHATSAPP_SUPORTE } from "@/lib/suporte";
import { WhatsappBubble } from "./WhatsappBubble";

describe("WhatsappBubble", () => {
  /**
   * O número do suporte já foi ao ar como `5511999999999`, um placeholder, na
   * página de contato. Por isso a asserção compara com `@/lib/suporte`, a fonte
   * única, em vez de repetir os dígitos aqui.
   */
  it("abre a conversa no número do suporte, com mensagem escrita", () => {
    renderWithProviders(<WhatsappBubble />);
    const link = screen.getByRole("link", { name: /WhatsApp/i });

    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith(`${WHATSAPP_SUPORTE.href}?text=`)).toBe(true);
    expect(decodeURIComponent(new URL(href).searchParams.get("text") ?? "")).toContain("site");
  });

  /* A aba nova ganha `window.opener` e consegue trocar a URL desta; `noreferrer`
     evita vazar a página de origem para o WhatsApp. */
  it("abre fora, sem dar controle da aba de origem", () => {
    renderWithProviders(<WhatsappBubble />);
    const link = screen.getByRole("link", { name: /WhatsApp/i });

    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  /**
   * O glifo é a marca do WhatsApp, não o `WhatsappLogo` do Phosphor: no canto da
   * tela o desenho precisa ser reconhecido como o app antes de qualquer leitura
   * de rótulo. A asserção olha o path porque é o que muda se alguém trocar de
   * volta pelo ícone do icon set.
   */
  it("desenha a marca do WhatsApp", () => {
    renderWithProviders(<WhatsappBubble />);
    const svg = screen.getByRole("link", { name: /WhatsApp/i }).querySelector("svg");

    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.querySelector("path")?.getAttribute("d")).toContain("M17.472 14.382");
  });

  /* A bolinha divide o canto inferior direito com a `ListingStickyBar`, que só
     existe na página da unidade e publica a própria altura em runtime. Por
     padrão (sem barra montada) a variável fica em 0px e a bolinha fica embaixo
     mesmo; o desvio soma por cima, e não troca de página em página. */
  it("soma o espaço da barra fixa de preço ao offset do rodapé", () => {
    renderWithProviders(<WhatsappBubble />);
    const classes = screen.getByRole("link", { name: /WhatsApp/i }).className;

    expect(classes).toContain("bottom-[calc(1rem+var(--sticky-bar-space)+var(--safe-bottom))]");
    expect(classes).toContain("tablet:bottom-[calc(1.5rem+var(--sticky-bar-space)+var(--safe-bottom))]");
  });
  /**
   * A promessa tem que existir como TEXTO no DOM, não só dentro da arte.
   *
   * Queimada no PNG do mascote ela não é lida por leitor de tela, não é indexada
   * e mudar a copy viraria um render novo. Este caso quebra se alguém trocar o
   * texto por imagem.
   */
  it("tem a promessa como texto de verdade, não como imagem", () => {
    renderWithProviders(<WhatsappBubble />);

    expect(screen.getByText("Reserva rápida")).toBeInTheDocument();
    expect(screen.getByText("em menos de 1min")).toBeInTheDocument();
  });

  /* O nome acessível traz a frase inteira: quem usa leitor de tela precisa saber
     o que o link promete, não só para onde ele leva. */
  it("o nome acessível traz a promessa e o destino", () => {
    renderWithProviders(<WhatsappBubble />);
    const nome = screen.getByRole("link").getAttribute("aria-label") ?? "";

    expect(nome).toContain("Reserva rápida em menos de 1min");
    expect(nome).toContain("WhatsApp");
  });

  /* O mascote é decorativo: o nome do link já diz tudo, e repetir faria o leitor
     de tela falar duas vezes. Largura e altura evitam o pulo de layout. */
  it("o mascote não entra na árvore de acessibilidade", () => {
    renderWithProviders(<WhatsappBubble />);
    const img = screen.getByRole("link").querySelector("img");

    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("src", "/images/mia-whatsapp.webp");
    expect(img).toHaveAttribute("width");
    expect(img).toHaveAttribute("height");
  });

  /**
   * Quem pediu menos movimento recebe uma peça parada.
   *
   * As três camadas animadas precisam do `motion-reduce:animate-none`, senão uma
   * delas continua mexendo sozinha e o resultado fica pior que animar tudo.
   */
  it("todas as camadas animadas respeitam prefers-reduced-motion", () => {
    const { container } = renderWithProviders(<WhatsappBubble />);

    const animadas = container.querySelectorAll('[class*="animate-mia-"]');
    expect(animadas).toHaveLength(3);
    animadas.forEach((el) => {
      expect(el.className).toContain("motion-reduce:animate-none");
    });
  });

  /**
   * Trava do bug de renderização já documentado no componente: `bottom` depende
   * de `--sticky-bar-space` (calc com var()) e, quando animado, travava numa
   * posição intermediária errada. O flutuar tem que sair de `transform`, e este
   * caso quebra se alguém puser `bottom` de volta na lista do que anima.
   */
  it("o flutuar sai de transform, e nunca de bottom", () => {
    renderWithProviders(<WhatsappBubble />);
    const classes = screen.getByRole("link").className;

    expect(classes).toContain("animate-mia-flutuar");
    expect(classes).not.toContain("transition-all");
    expect(classes).toContain("transition-colors");
  });
  /**
   * Regressão: `duration-*` sequestra a duração da animação.
   *
   * Esta versão do Tailwind emite duas regras para `duration-200`, e a segunda é
   * `animation-duration: 200ms`. Como ela vem depois de `.animate-mia-flutuar` na
   * folha, o flutuar caiu de 3,4s para 0,2s e virou um tremor. O caso quebra se
   * alguém puser um `duration-*` de volta num elemento animado.
   */
  it("não deixa duration-* junto de animate-* no mesmo elemento", () => {
    const { container } = renderWithProviders(<WhatsappBubble />);

    container.querySelectorAll('[class*="animate-mia-"]').forEach((el) => {
      expect(el.className).not.toMatch(/(^|\s)duration-/);
    });
  });
});
