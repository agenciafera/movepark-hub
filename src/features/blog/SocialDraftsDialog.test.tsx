import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SocialDraftsDialog } from "./SocialDraftsDialog";
import type { BlogPostWithDestination } from "@/types/domain";

const CORPO = `A diária sai por R$ 16,90 em 27 de agosto de 2026.

| Resposta rápida | Valor em 27/08/2026 |
| --- | --- |
| Menor semana | R$ 118,30 |
| Menor mês | R$ 477,00 |

## Quanto custa hoje

| Pátio | Distância | 7 diárias | 30 diárias |
| --- | --- | --- | --- |
| Abbapark | 2,6 km | R$ 118,30 | R$ 477,00 |
| Nationpark | 1,4 km | R$ 139,30 | R$ 567,00 |
| Talentos | 3,0 km | R$ 149,30 | R$ 597,00 |

## O que conferir antes

- Confira a distância até o terminal
- Some o tempo de traslado
- Veja se a coberta compensa
- Cheque a permanência mínima
- Leve o número do voo

## Perguntas frequentes

### Quanto custa a menor estadia?

Três diárias, que é o piso dos dois pátios.
`;

function post(over: Partial<BlogPostWithDestination> = {}): BlogPostWithDestination {
  return {
    id: "p1",
    title: "Quanto custa estacionar no Afonso Pena",
    slug: "quanto-custa-estacionar-no-afonso-pena",
    body_md: CORPO,
    destination: {
      id: "d1",
      name: "Aeroporto Afonso Pena",
      short_name: "Afonso Pena",
      slug: "aeroporto-afonso-pena",
    },
    category: null,
    author: null,
    tags: [],
    ...over,
  } as BlogPostWithDestination;
}

describe("SocialDraftsDialog", () => {
  const escrever = vi.fn<(t: string) => Promise<void>>();

  beforeEach(() => {
    escrever.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: escrever },
    });
  });

  it("mostra os quatro recortes na ordem sugerida de publicação", () => {
    render(<SocialDraftsDialog open onOpenChange={() => {}} post={post()} />);

    // Os quatro não saem no mesmo dia, então a posição na semana é parte da tela.
    expect(screen.getByText("1 de 4. Âncora de preço")).toBeInTheDocument();
    expect(screen.getByText("2 de 4. Pergunta da FAQ")).toBeInTheDocument();
    expect(screen.getByText("3 de 4. Comparativo")).toBeInTheDocument();
    expect(screen.getByText("4 de 4. Checklist")).toBeInTheDocument();
  });

  it("copia a legenda com a URL do post, que é o que o Instagram distribui", async () => {
    render(<SocialDraftsDialog open onOpenChange={() => {}} post={post()} />);

    await userEvent.click(screen.getAllByRole("button", { name: /Copiar legenda/ })[0]);

    expect(escrever).toHaveBeenCalledTimes(1);
    expect(escrever.mock.calls[0][0]).toContain("/blog/quanto-custa-estacionar-no-afonso-pena/");
  });

  it("não deixa copiar recorte que promete transação (ADR-009)", () => {
    const comPromessa = post({
      body_md: CORPO.replace("Confira a distância até o terminal", "Vaga garantida na chegada"),
    });
    render(<SocialDraftsDialog open onOpenChange={() => {}} post={comPromessa} />);

    const botoes = screen.getAllByRole("button", { name: /Copiar legenda/ });
    expect(botoes.some((b) => b.hasAttribute("disabled"))).toBe(true);
    expect(screen.getByText(/ADR-009/)).toBeInTheDocument();
  });

  it("diz o que o artigo não sustenta em vez de mostrar card vazio", () => {
    const magro = post({ body_md: "## Só uma seção\n\nUm parágrafo curto.\n" });
    render(<SocialDraftsDialog open onOpenChange={() => {}} post={magro} />);

    expect(screen.getByText("O que o artigo não sustenta")).toBeInTheDocument();
    expect(screen.getByText(/não tem tabela com valor em R\$/)).toBeInTheDocument();
  });
});
