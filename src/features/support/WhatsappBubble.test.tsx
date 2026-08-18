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

  /* A bolinha divide o canto inferior direito com a `ListingStickyBar` no
     mobile. Sem o desvio de 5rem ela cobre o botão de reservar da unidade. */
  it("no mobile fica acima da barra fixa de preço", () => {
    renderWithProviders(<WhatsappBubble />);
    const classes = screen.getByRole("link", { name: /WhatsApp/i }).className;

    expect(classes).toContain("bottom-[calc(5rem+var(--safe-bottom))]");
    expect(classes).toContain("tablet:bottom-6");
  });
});
