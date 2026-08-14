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
const foto = () => document.querySelector('img[src="/images/hero-image.webp"]');

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
  it("o vídeo nasce mudo, em linha, em loop e sem controle", async () => {
    renderWithProviders(<Hero />);
    await waitFor(() => expect(video()).toBeInTheDocument());

    const el = video() as HTMLVideoElement;
    expect(el).toHaveAttribute("muted");
    expect(el).toHaveAttribute("playsInline");
    expect(el).toHaveAttribute("loop");
    expect(el).toHaveAttribute("autoplay");
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
