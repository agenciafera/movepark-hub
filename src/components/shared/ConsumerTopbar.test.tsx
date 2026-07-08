import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
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
    expect(screen.queryByText("Onde · Quando · Veículo")).not.toBeInTheDocument();
    // O shell de consumidor permanece: "Entrar" continua acessível.
    expect(screen.getByRole("link", { name: "Entrar" })).toBeInTheDocument();
  });

  it("mostra a busca em rotas de consumidor fora da home (ex: /search)", () => {
    renderWithProviders(<ConsumerTopbar />, { route: "/search" });

    // O atalho mobile de busca aparece quando a busca está habilitada.
    expect(screen.getByText("Onde · Quando · Veículo")).toBeInTheDocument();
  });

  it("não renderiza a busca na home (o hero já traz a barra grande)", () => {
    renderWithProviders(<ConsumerTopbar />, { route: "/" });

    expect(screen.queryByText("Onde · Quando · Veículo")).not.toBeInTheDocument();
  });
});
