import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { tabela, falha } from "@/test/msw/supabase";
import { Hero } from "./Hero";

/** Estado do ambiente que decide se o vídeo do banner entra. */
function ambiente({
  movimentoReduzido = false,
  economiaDeDados = false,
  tipoDeRede = "4g",
}: { movimentoReduzido?: boolean; economiaDeDados?: boolean; tipoDeRede?: string } = {}) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion") && movimentoReduzido,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: { saveData: economiaDeDados, effectiveType: tipoDeRede },
  });
}

const video = () => document.querySelector("video");
const videos = () => [...document.querySelectorAll("video")];
const foto = () => document.querySelector('img[src="/images/hero-image.webp"]');

/** O clipe que está aceso agora, pela opacidade. */
const clipeVisivel = () => videos().findIndex((v) => v.className.includes("opacity-100"));

/** happy-dom não implementa mídia: sem isso `duration` é NaN e nada avança. */
function simularMidia(v: HTMLVideoElement, { duracao = 5, pronto = 4 } = {}) {
  Object.defineProperty(v, "duration", { configurable: true, value: duracao });
  Object.defineProperty(v, "readyState", { configurable: true, value: pronto });
  v.play = vi.fn().mockResolvedValue(undefined);
}

/** Abre a sequência: o primeiro clipe consegue tocar e destrava os outros. */
async function abrirSequencia() {
  await waitFor(() => expect(video()).toBeInTheDocument());
  await act(async () => {
    videos()[0].dispatchEvent(new Event("canplay", { bubbles: true }));
  });
  await waitFor(() => expect(videos()).toHaveLength(3));
  for (const v of videos()) simularMidia(v);
}

/** Empurra um clipe para dentro da janela de cruzamento. */
async function chegarAoFim(i: number) {
  const v = videos()[i];
  Object.defineProperty(v, "currentTime", { configurable: true, writable: true, value: 4.5 });
  await act(async () => {
    v.dispatchEvent(new Event("timeupdate", { bubbles: true }));
  });
}

describe("Hero — selo de prova social", () => {
  /**
   * O número nasce cravado no componente, então o SSG publica o selo no HTML e
   * o crawler vê o número. Se dependesse da rede, a home iria ao ar sem ele.
   */
  it("mostra o número padrão antes de qualquer resposta do servidor", () => {
    renderWithProviders(<Hero />);
    expect(screen.getByText("+300 mil clientes")).toBeInTheDocument();
  });

  it("assume o valor do app_setting quando ele difere do padrão", async () => {
    tabela("app_setting", "get", { json: [{ value: "412000" }] });
    renderWithProviders(<Hero />);
    await waitFor(() => {
      expect(screen.getByText("+412 mil clientes")).toBeInTheDocument();
    });
  });

  /**
   * Config é campo de texto livre. Um zero salvo por engano viraria
   * "+0 clientes" no topo da home, que é pior que um número desatualizado.
   */
  it("ignora valor zerado ou sujo e mantém o padrão", async () => {
    tabela("app_setting", "get", { json: [{ value: "0" }] });
    renderWithProviders(<Hero />);
    await waitFor(() => {
      expect(screen.getByText("+300 mil clientes")).toBeInTheDocument();
    });
  });

  /** Supabase fora do ar não pode apagar a prova social do topo da home. */
  it("mantém o selo quando a leitura falha", async () => {
    falha("tabela", "app_setting", 500);
    renderWithProviders(<Hero />);
    await waitFor(() => {
      expect(screen.getByText("+300 mil clientes")).toBeInTheDocument();
    });
  });
});

describe("Hero — vídeo de fundo", () => {
  beforeEach(() => ambiente());

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "connection");
  });

  /**
   * A foto é o LCP e o estado base do banner. Ela fica na página mesmo com o
   * vídeo por cima, senão um erro no arquivo deixaria o topo da home vazio.
   */
  it("a foto continua na página com o vídeo carregado", async () => {
    renderWithProviders(<Hero />);
    await waitFor(() => expect(video()).toBeInTheDocument());
    expect(foto()).toBeInTheDocument();
  });

  it("não monta o vídeo quando o sistema pede menos movimento", async () => {
    ambiente({ movimentoReduzido: true });
    renderWithProviders(<Hero />);
    await waitFor(() => expect(foto()).toBeInTheDocument());
    expect(video()).toBeNull();
  });

  it("não monta o vídeo com economia de dados ligada", async () => {
    ambiente({ economiaDeDados: true });
    renderWithProviders(<Hero />);
    await waitFor(() => expect(foto()).toBeInTheDocument());
    expect(video()).toBeNull();
  });

  it("não monta o vídeo em rede lenta", async () => {
    ambiente({ tipoDeRede: "3g" });
    renderWithProviders(<Hero />);
    await waitFor(() => expect(foto()).toBeInTheDocument());
    expect(video()).toBeNull();
  });

  /**
   * Sem `muted` e `playsInline` o iOS recusa o autoplay e o banner congela no
   * primeiro quadro, que é pior que a foto: fica um vídeo parado sem controle.
   */
  it("o vídeo nasce mudo, em linha e sem controle", async () => {
    renderWithProviders(<Hero />);
    await waitFor(() => expect(video()).toBeInTheDocument());

    const el = video() as HTMLVideoElement;
    expect(el).toHaveAttribute("muted");
    expect(el).toHaveAttribute("playsInline");
    expect(el).toHaveAttribute("autoplay");
    /* Quem repete é a sequência, não o clipe: com `loop` o primeiro nunca
       terminaria e a história pararia nele. */
    expect(el).not.toHaveAttribute("loop");
    expect(el).not.toHaveAttribute("controls");
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveAttribute("tabIndex", "-1");
  });

  /**
   * Regressão de contraste, medida no navegador: o movimento da câmera traz a
   * janela clara do fundo para trás do selo de prova social, e sem o
   * `brightness` ele vira branco sobre branco e some. Os gradientes seguram o
   * H1, mas não aquele bloco.
   */
  it("o vídeo entra escurecido, senão o selo de prova social some", async () => {
    renderWithProviders(<Hero />);
    await waitFor(() => expect(video()).toBeInTheDocument());
    expect(video()?.className).toContain("brightness-[0.82]");
  });

  /**
   * Os três de uma vez seriam três downloads brigando na abertura da home, e o
   * que o usuário precisa ver primeiro é justamente o primeiro.
   */
  it("só o primeiro clipe monta antes de a sequência abrir", async () => {
    renderWithProviders(<Hero />);
    await waitFor(() => expect(video()).toBeInTheDocument());
    expect(videos()).toHaveLength(1);
    expect(videos()[0]).toHaveAttribute("src", "/images/hero-video.mp4");
  });

  it("os outros clipes entram depois que o primeiro consegue tocar", async () => {
    renderWithProviders(<Hero />);
    await abrirSequencia();
    expect(videos().map((v) => v.getAttribute("src"))).toEqual([
      "/images/hero-video.mp4",
      "/images/hero-video-saida.mp4",
      "/images/hero-video-cancela.mp4",
    ]);
  });

  it("percorre a sequência e volta ao primeiro no fim", async () => {
    renderWithProviders(<Hero />);
    await abrirSequencia();
    expect(clipeVisivel()).toBe(0);

    await chegarAoFim(0);
    expect(clipeVisivel()).toBe(1);

    await chegarAoFim(1);
    expect(clipeVisivel()).toBe(2);

    await chegarAoFim(2);
    expect(clipeVisivel()).toBe(0);
  });

  /**
   * Regressão: `timeupdate` dispara umas quatro vezes por segundo, e todos os
   * disparos que chegam entre a troca e o re-render veem o mesmo estado. Sem a
   * trava no ref, eles passariam pela mesma condição e pulariam clipe.
   */
  it("vários timeupdate seguidos avançam um clipe só", async () => {
    renderWithProviders(<Hero />);
    await abrirSequencia();

    const v = videos()[0];
    Object.defineProperty(v, "currentTime", { configurable: true, writable: true, value: 4.5 });
    await act(async () => {
      for (let i = 0; i < 5; i++) v.dispatchEvent(new Event("timeupdate", { bubbles: true }));
    });

    expect(clipeVisivel()).toBe(1);
  });

  /**
   * Trocar para um clipe sem quadro na mão revelaria um retângulo vazio no meio
   * do cruzamento, que é pior que o corte seco que ele veio evitar.
   */
  it("não cruza para um clipe que ainda não tem quadro", async () => {
    renderWithProviders(<Hero />);
    await abrirSequencia();
    simularMidia(videos()[1], { pronto: 0 });

    await chegarAoFim(0);
    expect(clipeVisivel()).toBe(0);
  });

  /** O `ended` é a última chance: travar ali deixaria o banner parado. */
  it("o fim do clipe avança mesmo sem o próximo estar pronto", async () => {
    renderWithProviders(<Hero />);
    await abrirSequencia();
    simularMidia(videos()[1], { pronto: 0 });

    await act(async () => {
      videos()[0].dispatchEvent(new Event("ended", { bubbles: true }));
    });
    expect(clipeVisivel()).toBe(1);
  });

  /** Enquanto baixa, mostrar o vídeo trocaria a foto por um retângulo preto. */
  it("o vídeo entra invisível e só aparece quando dá para tocar", async () => {
    renderWithProviders(<Hero />);
    await waitFor(() => expect(video()).toBeInTheDocument());

    const el = video() as HTMLVideoElement;
    expect(el.className).toContain("opacity-0");

    await act(async () => {
      el.dispatchEvent(new Event("canplay", { bubbles: true }));
    });
    expect(video()?.className).toContain("opacity-100");
  });
});
