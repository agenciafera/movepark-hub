import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SocialPostSlide } from "@/types/domain";
import { PreviaFeed } from "./PreviaFeed";
import { AVATAR, comentariosFicticios, numerosFicticios, USUARIO } from "./previa.logic";

function slides(n: number): SocialPostSlide[] {
  return Array.from({ length: n }, (_, i) => ({
    url: `https://exemplo.co/${i + 1}.jpg`,
    path: `social/confins/${i + 1}.jpg`,
    alt: `slide ${i + 1}`,
    texto: null,
  }));
}

const LONGA =
  "Estacionar no aeroporto de Confins sai mais barato do que parece quando a viagem passa de uma semana inteira. " +
  "A conta muda pelo traslado.\n\n#confins #estacionamentoaeroporto @moveparkestacionamento";

function previa(over: Partial<React.ComponentProps<typeof PreviaFeed>["post"]> = {}) {
  return (
    <PreviaFeed
      post={{
        id: "p1",
        caption: LONGA,
        slides: slides(6),
        scheduled_at: "2026-10-22T15:00:00Z",
        ...over,
      }}
    />
  );
}

describe("PreviaFeed", () => {
  it("mostra o usuário e o avatar da Movepark no cabeçalho e na legenda", () => {
    render(previa());
    expect(screen.getAllByText(USUARIO).length).toBeGreaterThanOrEqual(2);
    const avatar = screen.getByTestId("previa-avatar") as HTMLImageElement;
    expect(avatar.getAttribute("src")).toBe(AVATAR);
  });

  it("mostra quem curtiu, com o número fictício do post", () => {
    render(previa());
    const { curtidas } = numerosFicticios("p1");
    expect(screen.getByText(/Curtido por/)).toHaveTextContent(
      `Curtido por camila.viaja e outras ${curtidas} pessoas`,
    );
  });

  it("mostra o total de comentários e os dois comentários fictícios do post", () => {
    render(previa());
    const { comentarios } = numerosFicticios("p1");
    expect(screen.getByText(`Ver todos os ${comentarios} comentários`)).toBeInTheDocument();
    // O "Curtido por" já cita um usuário, então os comentários se procuram dentro do bloco deles.
    const bloco = within(screen.getByTestId("previa-comentarios"));
    for (const c of comentariosFicticios("p1")) {
      expect(bloco.getByText(c.texto)).toBeInTheDocument();
      expect(bloco.getByText(c.usuario)).toBeInTheDocument();
    }
  });

  it("mostra o dia do agendamento em São Paulo, em minúsculas", () => {
    render(previa());
    expect(screen.getByText("22 de outubro")).toBeInTheDocument();
  });

  it("explica que curtidas e comentários são fictícios", () => {
    render(previa());
    expect(screen.getByText("Simulação: curtidas e comentários fictícios.")).toBeInTheDocument();
  });

  describe("legenda", () => {
    it("legenda longa mostra só o começo e o botão mais; ao clicar mostra a legenda inteira", async () => {
      render(previa());
      const legenda = screen.getByTestId("previa-legenda");
      expect(legenda).not.toHaveTextContent("traslado");
      const mais = screen.getByRole("button", { name: "… mais" });

      await userEvent.click(mais);
      expect(legenda).toHaveTextContent("A conta muda pelo traslado.");
      expect(legenda).toHaveTextContent("#estacionamentoaeroporto");
      expect(screen.queryByRole("button", { name: "… mais" })).not.toBeInTheDocument();
      expect(legenda.className).toContain("whitespace-pre-line");
    });

    it("legenda curta aparece inteira, sem o mais", () => {
      render(previa({ caption: "Confins em um minuto" }));
      expect(screen.getByTestId("previa-legenda")).toHaveTextContent("Confins em um minuto");
      expect(screen.queryByRole("button", { name: /mais/ })).not.toBeInTheDocument();
    });

    it("hashtags e menções saem em azul do Instagram, e o texto comum não", () => {
      render(previa({ caption: "Confins hoje #confins com @moveparkestacionamento" }));
      const legenda = screen.getByTestId("previa-legenda");
      expect(screen.getByText("#confins").className).toContain("text-[#00376b]");
      // A menção também está no cabeçalho como nome; a da legenda é a que tem a cor.
      const mencoes = screen.getAllByText("@moveparkestacionamento");
      expect(mencoes).toHaveLength(1);
      expect(mencoes[0].className).toContain("text-[#00376b]");
      expect(legenda).toHaveTextContent("Confins hoje #confins com @moveparkestacionamento");
    });
  });

  describe("carrossel", () => {
    it("começa no primeiro slide, com o contador 1/6 e sem a seta de voltar", () => {
      render(previa());
      expect(screen.getByText("1/6")).toBeInTheDocument();
      expect(screen.getByAltText("slide 1")).toHaveAttribute("src", "https://exemplo.co/1.jpg");
      expect(screen.queryByRole("button", { name: "Slide anterior" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Próximo slide" })).toBeInTheDocument();
    });

    it("as setas mudam o slide e o contador, e escondem nos extremos", async () => {
      render(previa());
      await userEvent.click(screen.getByRole("button", { name: "Próximo slide" }));
      expect(screen.getByText("2/6")).toBeInTheDocument();
      expect(screen.getByAltText("slide 2")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Slide anterior" }));
      expect(screen.getByText("1/6")).toBeInTheDocument();
      expect(screen.getByAltText("slide 1")).toBeInTheDocument();

      for (let i = 0; i < 5; i++) {
        await userEvent.click(screen.getByRole("button", { name: "Próximo slide" }));
      }
      expect(screen.getByText("6/6")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Próximo slide" })).not.toBeInTheDocument();
    });

    it("tem um pontinho por slide, com o atual marcado", async () => {
      render(previa());
      expect(screen.getAllByTestId("previa-ponto")).toHaveLength(6);
      expect(screen.getAllByTestId("previa-ponto")[0]).toHaveAttribute("data-atual", "true");
      await userEvent.click(screen.getByRole("button", { name: "Próximo slide" }));
      expect(screen.getAllByTestId("previa-ponto")[1]).toHaveAttribute("data-atual", "true");
      expect(screen.getAllByTestId("previa-ponto")[0]).toHaveAttribute("data-atual", "false");
    });

    it("post de uma imagem só não tem contador, setas nem pontinhos", () => {
      render(previa({ slides: slides(1) }));
      expect(screen.queryByText("1/1")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Próximo slide" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Slide anterior" })).not.toBeInTheDocument();
      expect(screen.queryAllByTestId("previa-ponto")).toHaveLength(0);
    });

    it("a imagem é 4:5 e usa o alt do slide", () => {
      render(previa());
      const img = screen.getByAltText("slide 1");
      expect(img.className).toContain("object-cover");
      expect(img.parentElement?.className).toContain("aspect-[4/5]");
    });
  });
});
