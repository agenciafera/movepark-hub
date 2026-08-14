import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import { REDES } from "@/lib/redes";
import { WHATSAPP_SUPORTE } from "@/lib/suporte";
import ContatoPage from "./contato";

function render() {
  return renderWithProviders(
    <HelmetProvider>
      <ContatoPage />
    </HelmetProvider>,
  );
}

describe("ContatoPage — canais diretos", () => {
  /**
   * O formulário saiu em 14/08/2026. Ele pedia que a pessoa escrevesse, mandasse
   * e esperasse sem saber se tinha chegado, e antes disso chegou a dizer
   * "Mensagem enviada!" sem ter enviado nada. Este caso existe para a página não
   * ganhar um formulário de volta sem decisão.
   */
  it("não tem formulário nem campo de mensagem", () => {
    const { container } = render();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(screen.queryByRole("button", { name: /enviar/i })).not.toBeInTheDocument();
  });

  it("o WhatsApp aponta para o número real do suporte", () => {
    render();
    const link = screen.getByRole("link", { name: /Abrir conversa/i });
    expect(link).toHaveAttribute("href", WHATSAPP_SUPORTE.href);
  });

  it("lista as três redes, cada uma com link que abre fora", () => {
    render();
    for (const rede of REDES) {
      const link = screen.getByRole("link", { name: new RegExp(rede.nome, "i") });
      expect(link).toHaveAttribute("href", rede.url);
      expect(link).toHaveAttribute("target", "_blank");
      /* `noopener` porque a aba nova ganha `window.opener` e consegue trocar a
         URL desta; `noreferrer` para não vazar a página de origem. */
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  /**
   * A home promete atendimento a qualquer hora pelo assistente, e a equipe
   * atende em dia útil. Sem dizer de quem é cada janela, uma das duas parece
   * mentira.
   */
  it("separa o horário da equipe do assistente que cobre o resto", () => {
    render();
    expect(screen.getByText(/Segunda a sexta, das 9h às 18h/)).toBeInTheDocument();
    expect(screen.getByText(/assistente do site responde/)).toBeInTheDocument();
  });

  it("mantém o caminho para a central de perguntas", () => {
    render();
    expect(screen.getByRole("link", { name: /Perguntas Frequentes/i })).toHaveAttribute(
      "href",
      "/faq",
    );
  });
});
