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
});
