import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GoogleReviewsBlock } from "./GoogleReviewsBlock";
import type { GooglePlaceSnapshot } from "@/types/domain";

const snapshot: GooglePlaceSnapshot = {
  place_id: "ChIJ_x",
  rating: 4.6,
  user_rating_count: 312,
  maps_uri: "https://maps.google.com/?cid=1",
  fetched_at: new Date().toISOString(),
  reviews: [
    {
      rating: 5,
      text: "Atendimento rapido e vaga coberta.",
      publishTime: "2026-07-02T10:00:00Z",
      relativePublishTimeDescription: "há um mês",
      authorName: "Ana P.",
      authorPhotoUri: "https://lh3.googleusercontent.com/a/1",
      authorUri: "https://www.google.com/maps/contrib/1",
      reviewUri: "https://maps.google.com/review/1",
    },
    {
      rating: 4,
      text: "Bom preco, mas o shuttle demorou.",
      publishTime: "2026-06-10T10:00:00Z",
      relativePublishTimeDescription: "há dois meses",
      authorName: "Bruno S.",
      authorPhotoUri: "https://lh3.googleusercontent.com/a/2",
      authorUri: "https://www.google.com/maps/contrib/2",
      reviewUri: "https://maps.google.com/review/2",
    },
  ],
};

describe("GoogleReviewsBlock", () => {
  it("nomeia o Google no heading e deixa a nota agregada inequivoca sobre a fonte", () => {
    render(<GoogleReviewsBlock snapshot={snapshot} placeName="Talentos Park" />);
    expect(screen.getByRole("heading", { name: /avaliações no google/i })).toBeInTheDocument();
    expect(screen.getByText("4,6")).toBeInTheDocument();
    // A nota agregada é o número que mais se confunde com a nota da Movepark na mesma página:
    // tem que sobrar texto visível "no Google" perto dela, além do heading e do link de rodapé.
    expect(screen.getByText("no Google")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ver todas as avaliações no google/i }),
    ).toHaveAttribute("href", "https://maps.google.com/?cid=1");
  });

  it("credita cada avaliação com nome, foto e link do autor, que e condicao de uso", () => {
    render(<GoogleReviewsBlock snapshot={snapshot} placeName="Talentos Park" />);

    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);

    const [anaCard, brunoCard] = cards;

    const anaFoto = within(anaCard).getByAltText("Ana P.") as HTMLImageElement;
    expect(anaFoto.src).toContain("lh3.googleusercontent.com");
    expect(anaFoto).toHaveAttribute("width", "32");
    expect(anaFoto).toHaveAttribute("height", "32");
    expect(anaFoto).toHaveAttribute("referrerPolicy", "no-referrer");
    expect(within(anaCard).getByRole("link", { name: "Ana P." })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/contrib/1",
    );
    expect(within(anaCard).getByRole("link", { name: /ver no google/i })).toHaveAttribute(
      "href",
      "https://maps.google.com/review/1",
    );
    expect(within(anaCard).getByText("Atendimento rapido e vaga coberta.")).toBeInTheDocument();

    const brunoFoto = within(brunoCard).getByAltText("Bruno S.") as HTMLImageElement;
    expect(brunoFoto).toHaveAttribute("width", "32");
    expect(brunoFoto).toHaveAttribute("height", "32");
    expect(within(brunoCard).getByRole("link", { name: "Bruno S." })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/contrib/2",
    );
    expect(within(brunoCard).getByRole("link", { name: /ver no google/i })).toHaveAttribute(
      "href",
      "https://maps.google.com/review/2",
    );
  });

  it("nao renderiza quando o snapshot passou dos 30 dias, porque o HTML do SSG tambem e cache", () => {
    const velho = { ...snapshot, fetched_at: "2026-01-01T00:00:00Z" };
    const { container } = render(<GoogleReviewsBlock snapshot={velho} placeName="Talentos Park" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nao renderiza sem snapshot", () => {
    const { container } = render(<GoogleReviewsBlock snapshot={null} placeName="Talentos Park" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nao renderiza quando o lugar nao tem avaliacao nenhuma", () => {
    const vazio = { ...snapshot, rating: null, user_rating_count: 0, reviews: [] };
    const { container } = render(<GoogleReviewsBlock snapshot={vazio} placeName="Talentos Park" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("GoogleReviewsBlock: carrossel", () => {
  const longa =
    "O acesso pelo aplicativo foi tranquilo e a vaga estava coberta como prometido, mas o " +
    "transfer da volta demorou quase quarenta minutos no desembarque e ninguem soube explicar " +
    "onde ficava o ponto certo de embarque das malas, o que atrapalhou bastante a chegada em " +
    "casa depois de um voo longo com criancas cansadas.";

  const comLonga: GooglePlaceSnapshot = {
    ...snapshot,
    reviews: [{ ...snapshot.reviews[0], text: longa }, snapshot.reviews[1]],
  };

  it("mantem as avaliacoes numa trilha horizontal, e nao numa grade empilhada", () => {
    const { container } = render(
      <GoogleReviewsBlock snapshot={snapshot} placeName="Talentos Park" />,
    );
    const trilha = container.querySelector("ul");
    // O scroll da ficha e o motivo do carrossel existir: cinco cards empilhados respondiam por
    // metade dela. Se a trilha voltar a ser grade, o bloco cresce de novo sem ninguem notar.
    expect(trilha?.className).toContain("overflow-x-auto");
    expect(trilha?.className).toContain("snap-mandatory");
    expect(trilha?.className).not.toContain("grid");
  });

  it("oferece as setas para quem nao tem gesto de arrasto", () => {
    render(<GoogleReviewsBlock snapshot={snapshot} placeName="Talentos Park" />);
    expect(screen.getByRole("button", { name: /avaliação anterior/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /próxima avaliação/i })).toBeInTheDocument();
  });

  it("nao mostra seta com uma avaliacao so, que e trilha sem para onde andar", () => {
    const uma = { ...snapshot, reviews: [snapshot.reviews[0]] };
    render(<GoogleReviewsBlock snapshot={uma} placeName="Talentos Park" />);
    expect(screen.queryByRole("button", { name: /próxima avaliação/i })).not.toBeInTheDocument();
  });

  it("recolhe a avaliacao longa sem tirar uma palavra do HTML, que e a atribuicao de pe", () => {
    render(<GoogleReviewsBlock snapshot={comLonga} placeName="Talentos Park" />);

    const texto = screen.getByText(longa);
    expect(texto.className).toContain("line-clamp-6");
    // O recorte e de CSS. O texto inteiro continua no HTML do SSG, que e o que chega ao crawler
    // e ao leitor de tela: "sem cortar" da spec vale sobre o conteudo, nao sobre a altura.
    expect(texto.textContent).toBe(longa);
  });

  it("abre a avaliacao longa na propria pagina, sem mandar o leitor para o Google", async () => {
    render(<GoogleReviewsBlock snapshot={comLonga} placeName="Talentos Park" />);

    const abrir = screen.getByRole("button", { name: "Ler mais" });
    expect(abrir).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(abrir);

    expect(screen.getByText(longa).className).not.toContain("line-clamp");
    const fechar = screen.getByRole("button", { name: "Ler menos" });
    expect(fechar).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(fechar);
    expect(screen.getByText(longa).className).toContain("line-clamp-6");
  });

  it("nao recolhe avaliacao curta nem oferece 'Ler mais' que nao revelaria nada", () => {
    render(<GoogleReviewsBlock snapshot={comLonga} placeName="Talentos Park" />);
    const curta = screen.getByText("Bom preco, mas o shuttle demorou.");
    expect(curta.className).not.toContain("line-clamp");
    expect(screen.getAllByRole("button", { name: "Ler mais" })).toHaveLength(1);
  });
});

describe("GoogleReviewsBlock: setas da trilha", () => {
  /** A trilha mede a si mesma, e o ambiente de teste não tem layout: as medidas entram na mão. */
  function medir(trilha: HTMLElement, { scrollLeft = 0, clientWidth = 600, scrollWidth = 1500 }) {
    Object.defineProperty(trilha, "clientWidth", { value: clientWidth, configurable: true });
    Object.defineProperty(trilha, "scrollWidth", { value: scrollWidth, configurable: true });
    Object.defineProperty(trilha, "scrollLeft", { value: scrollLeft, configurable: true });
    const card = trilha.querySelector("li")!;
    Object.defineProperty(card, "clientWidth", { value: 300, configurable: true });
    fireEvent.scroll(trilha);
  }

  it("anda um card por vez, porque o passo aqui e uma avaliacao para ler", async () => {
    const { container } = render(
      <GoogleReviewsBlock snapshot={snapshot} placeName="Talentos Park" />,
    );
    const trilha = container.querySelector("ul")!;
    const scrollBy = vi.fn();
    trilha.scrollBy = scrollBy;
    medir(trilha, { scrollLeft: 0 });

    await userEvent.click(screen.getByRole("button", { name: /próxima avaliação/i }));
    // 300 do card + 16 do respiro: para no começo do card seguinte, e não num meio de texto.
    expect(scrollBy).toHaveBeenCalledWith({ left: 316, behavior: "smooth" });
  });

  it("desliga a seta que nao tem para onde andar, nas duas pontas", () => {
    const { container } = render(
      <GoogleReviewsBlock snapshot={snapshot} placeName="Talentos Park" />,
    );
    const trilha = container.querySelector("ul")!;
    const anterior = screen.getByRole("button", { name: /avaliação anterior/i });
    const proxima = screen.getByRole("button", { name: /próxima avaliação/i });

    medir(trilha, { scrollLeft: 0 });
    expect(anterior).toBeDisabled();
    expect(proxima).toBeEnabled();

    medir(trilha, { scrollLeft: 316 });
    expect(anterior).toBeEnabled();
    expect(proxima).toBeEnabled();

    medir(trilha, { scrollLeft: 900 });
    expect(anterior).toBeEnabled();
    expect(proxima).toBeDisabled();
  });
});
