import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostShare } from "./PostShare";
import { PostProgress } from "./PostProgress";

const URL_POST = "https://movepark.co/blog/estacionamento-viracopos/";
const TITULO = "Estacionamento em Viracopos";

describe("PostShare", () => {
  // `navigator.clipboard` é somente-leitura no happy-dom: só entra por defineProperty.
  const escrever = vi.fn<(t: string) => Promise<void>>();

  beforeEach(() => {
    escrever.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: escrever },
    });
  });

  /** Botão de rede social costuma vir com rastreador embutido; aqui é link comum. */
  it("cada rede é um link para o endpoint público dela, com a URL do post", () => {
    render(<PostShare title={TITULO} url={URL_POST} />);

    const wpp = screen.getByRole("link", { name: "Compartilhar no WhatsApp" });
    expect(wpp).toHaveAttribute("href", expect.stringContaining("wa.me"));
    expect(wpp.getAttribute("href")).toContain(encodeURIComponent(URL_POST));
    expect(wpp).toHaveAttribute("rel", expect.stringContaining("noopener"));

    expect(screen.getByRole("link", { name: "Compartilhar no LinkedIn" })).toHaveAttribute(
      "href",
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(URL_POST)}`,
    );
  });

  it("nenhum script de terceiro entra na página", () => {
    const { container } = render(<PostShare title={TITULO} url={URL_POST} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("copiar coloca a URL na área de transferência e confirma na tela", async () => {
    render(<PostShare title={TITULO} url={URL_POST} />);
    const botao = await screen.findByRole("button", { name: "Copiar link" });

    await userEvent.click(botao);

    expect(escrever).toHaveBeenCalledWith(URL_POST);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Link copiado" })).toBeInTheDocument();
    });
  });
});

const SECOES = [
  { id: "secao-1-precos", title: "Preços" },
  { id: "secao-2-traslado", title: "Traslado" },
];

describe("PostProgress", () => {
  /** Barra sem nome acessível é enfeite: quem usa teclado não sabe para onde vai. */
  it("cada barra é uma âncora com o título da seção no nome", () => {
    render(<PostProgress secoes={SECOES} />);
    const nav = screen.getByRole("navigation", { name: "Seções do post" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preços" })).toHaveAttribute("href", "#secao-1-precos");
    expect(screen.getByRole("link", { name: "Traslado" })).toHaveAttribute(
      "href",
      "#secao-2-traslado",
    );
  });

  /** Sem observer no ambiente de teste, vale a primeira seção. */
  it("marca a seção atual com aria-current", () => {
    render(<PostProgress secoes={SECOES} />);
    expect(screen.getByRole("link", { name: "Preços" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Traslado" })).not.toHaveAttribute("aria-current");
  });

  it("uma seção só não vira trilho de progresso", () => {
    const { container } = render(<PostProgress secoes={[SECOES[0]]} />);
    expect(container.firstChild).toBeNull();
  });
});
