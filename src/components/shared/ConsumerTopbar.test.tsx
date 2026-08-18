import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { server } from "@/test/msw/server";
import { ConsumerTopbar } from "./ConsumerTopbar";

describe("ConsumerTopbar — busca por rota", () => {
  // A topbar renderiza o menu "Destinos", que busca destinos (e destination_point). Resolve os
  // fetches com [] para não deixar requisição pendente até o teardown (evita crash do worker).
  beforeEach(() => {
    server.use(
      http.get("*/rest/v1/destination", () => HttpResponse.json([])),
      http.get("*/rest/v1/destination_point", () => HttpResponse.json([])),
    );
  });

  it("esconde o widget de busca na landing de parceiro (/seja-parceiro)", () => {
    renderWithProviders(<ConsumerTopbar />, { route: "/seja-parceiro" });

    // Nem a pill desktop (role combobox/textbox da SearchBarPill) nem o atalho mobile de busca.
    expect(screen.queryByText("Buscar vaga")).not.toBeInTheDocument();
    // O shell de consumidor permanece: "Entrar" continua acessível.
    expect(screen.getByRole("link", { name: "Entrar" })).toBeInTheDocument();
  });

  it("mostra a busca em rotas de consumidor fora da home (ex: /search)", () => {
    renderWithProviders(<ConsumerTopbar />, { route: "/search" });

    // O atalho mobile de busca aparece quando a busca está habilitada.
    expect(screen.getByText("Buscar vaga")).toBeInTheDocument();
  });

  /**
   * O atalho vale na home desde o primeiro quadro porque o banner não tem mais
   * busca abaixo do desktop: a barra grande empilhava quatro campos por cima do
   * vídeo. Sem o atalho aqui, o celular abriria a home sem nenhuma busca à vista.
   */
  it("na home o atalho de busca já nasce no header", () => {
    renderWithProviders(<ConsumerTopbar />, { route: "/" });

    expect(screen.getByText("Buscar vaga")).toBeInTheDocument();
  });

  /**
   * No desktop o banner continua com a barra inteira, e duas na mesma tela
   * competiriam pelo mesmo clique: a do header só entra quando a do hero sobe.
   */
  it("na home a barra inteira não entra antes de a do hero subir", () => {
    const { container } = renderWithProviders(<ConsumerTopbar />, { route: "/" });

    // A SearchBarPill é um <form>; o atalho do celular é um <button>.
    expect(container.querySelector("form")).toBeNull();
  });

  it("fora da home a barra inteira já vem montada", () => {
    const { container } = renderWithProviders(<ConsumerTopbar />, { route: "/search" });

    expect(container.querySelector("form")).not.toBeNull();
  });

  it("abre o modal de busca ao tocar no atalho mobile (não volta pra home)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsumerTopbar />, { route: "/search" });

    // Nenhum modal aberto de início.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Toca no atalho mobile de busca (o span vive dentro de um <button>).
    const trigger = screen.getByText("Buscar vaga").closest("button");
    expect(trigger).not.toBeNull();
    await user.click(trigger!);

    // Abre o modal por cima da página, com os campos reaproveitados (Onde, Quando, Veículo).
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Buscar vaga")).toBeInTheDocument();
    expect(within(dialog).getByText("Onde")).toBeInTheDocument();
    expect(within(dialog).getByText("Veículo")).toBeInTheDocument();
  });
});
