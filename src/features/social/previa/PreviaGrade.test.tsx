import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { SocialPostSlide, SocialPostStatus } from "@/types/domain";
import { PreviaGrade } from "./PreviaGrade";
import { AVATAR, type PostDaGrade, USUARIO } from "./previa.logic";

function slides(prefixo: string, n: number): SocialPostSlide[] {
  return Array.from({ length: n }, (_, i) => ({
    url: `https://exemplo.co/${prefixo}-${i + 1}.jpg`,
    path: `social/${prefixo}/${i + 1}.jpg`,
    alt: `${prefixo} ${i + 1}`,
    texto: null,
  }));
}

function vizinho(id: string, status: SocialPostStatus, dia: number): PostDaGrade {
  return {
    id,
    status,
    slides: slides(id, 3),
    scheduled_at: `2026-09-${String(dia).padStart(2, "0")}T15:00:00Z`,
    published_at: null,
  };
}

const ESTE = { id: "este", slides: slides("este", 4) };

const celulas = () => screen.getAllByTestId("celula-grade");

describe("PreviaGrade", () => {
  it("tem 3 colunas e 6 células, mesmo sem nenhum outro post", () => {
    render(<PreviaGrade post={ESTE} />);
    expect(celulas()).toHaveLength(6);
    expect(screen.getByTestId("grade").className).toContain("grid-cols-3");
  });

  it("as células são 3:4 com recorte central", () => {
    render(<PreviaGrade post={ESTE} fila={[vizinho("a", "published", 1)]} />);
    for (const c of celulas()) expect(c.className).toContain("aspect-[3/4]");
    expect(celulas()[0].querySelector("img")?.className).toContain("object-cover");
  });

  it("a capa deste post é a primeira célula, com o ícone de carrossel", () => {
    render(
      <PreviaGrade
        post={ESTE}
        fila={[vizinho("a", "published", 1), vizinho("este", "approved", 2)]}
      />,
    );
    const primeira = celulas()[0];
    expect(within(primeira).getByAltText("este 1")).toHaveAttribute(
      "src",
      "https://exemplo.co/este-1.jpg",
    );
    expect(within(primeira).getByLabelText("Carrossel")).toBeInTheDocument();
    // O próprio post, se vier na fila, não repete.
    expect(screen.getAllByAltText(/^este 1$/)).toHaveLength(1);
  });

  it("post de uma imagem só não leva o ícone de carrossel", () => {
    render(<PreviaGrade post={{ id: "solo", slides: slides("solo", 1) }} />);
    expect(screen.queryByLabelText("Carrossel")).not.toBeInTheDocument();
  });

  it("completa com outros posts publicados, publicando e agendados, do mais recente ao mais antigo", () => {
    const fila = [
      vizinho("antigo", "published", 1),
      vizinho("meio", "publishing", 2),
      vizinho("novo", "approved", 3),
    ];
    render(<PreviaGrade post={ESTE} fila={fila} />);
    const srcs = celulas().map((c) => c.querySelector("img")?.getAttribute("src") ?? null);
    expect(srcs).toEqual([
      "https://exemplo.co/este-1.jpg",
      "https://exemplo.co/novo-1.jpg",
      "https://exemplo.co/meio-1.jpg",
      "https://exemplo.co/antigo-1.jpg",
      null,
      null,
    ]);
  });

  it("posts recusados, em revisão, com falha e atrasados da fila não entram", () => {
    const fila = [
      vizinho("recusado", "rejected", 1),
      vizinho("revisao", "pending_review", 2),
      vizinho("falhou", "failed", 3),
      vizinho("atrasado", "overdue", 4),
      vizinho("bom", "published", 5),
    ];
    const { container } = render(<PreviaGrade post={ESTE} fila={fila} />);
    for (const id of ["recusado", "revisao", "falhou", "atrasado"]) {
      expect(container.querySelector(`img[src*="${id}-"]`)).toBeNull();
    }
    expect(container.querySelector('img[src*="bom-"]')).not.toBeNull();
    expect(celulas()).toHaveLength(6);
  });

  it("mostra no máximo 5 outros posts, e a grade continua com 6 células", () => {
    const fila = Array.from({ length: 9 }, (_, i) => vizinho(`p${i}`, "published", i + 1));
    render(<PreviaGrade post={ESTE} fila={fila} />);
    expect(celulas()).toHaveLength(6);
    expect(celulas().filter((c) => c.querySelector("img"))).toHaveLength(6);
    expect(screen.queryByAltText("p3 1")).not.toBeInTheDocument();
  });

  it("o que falta vira quadrado cinza neutro, sem imagem", () => {
    render(<PreviaGrade post={ESTE} fila={[vizinho("a", "published", 1)]} />);
    const vazias = celulas().filter((c) => !c.querySelector("img"));
    expect(vazias).toHaveLength(4);
    for (const v of vazias) expect(v.className).toContain("bg-[#efefef]");
  });

  it("mostra o avatar e o nome do perfil acima da grade", () => {
    render(<PreviaGrade post={ESTE} />);
    expect(screen.getByTestId("previa-avatar")).toHaveAttribute("src", AVATAR);
    expect(screen.getByText(USUARIO)).toBeInTheDocument();
  });

  it("avisa que a grade recorta a capa em 3:4", () => {
    render(<PreviaGrade post={ESTE} />);
    expect(
      screen.getByText(
        "A grade recorta a capa em 3:4. Confira se o título da capa continua inteiro.",
      ),
    ).toBeInTheDocument();
  });
});
