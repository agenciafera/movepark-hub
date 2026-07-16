import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { server } from "@/test/msw/server";
import { ConsumerAppShell } from "./ConsumerAppShell";

describe("ConsumerAppShell — bottom nav no mobile", () => {
  // Topbar/ChatWidget disparam fetches (destinos, config do chat); resolve com []
  // pra não deixar requisição pendente até o teardown.
  beforeEach(() => {
    server.use(
      http.get("*/rest/v1/destination", () => HttpResponse.json([])),
      http.get("*/rest/v1/destination_point", () => HttpResponse.json([])),
    );
  });

  it("mostra a bottom nav e o pb-16 em rotas normais (ex: /search)", () => {
    renderWithProviders(<ConsumerAppShell />, { route: "/search" });

    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(document.querySelector("main")?.className).toContain("pb-16");
  });

  it("esconde a bottom nav e o pb-16 na página do estacionamento (/p/...)", () => {
    renderWithProviders(<ConsumerAppShell />, {
      route: "/p/ferapark/unidade-aeroporto/uncovered",
    });

    // Na página do estacionamento o rodapé fixo do mobile é o CTA de reserva.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(document.querySelector("main")?.className).not.toContain("pb-16");
  });
});
