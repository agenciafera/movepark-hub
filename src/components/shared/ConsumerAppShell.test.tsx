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

  it("mostra a bottom nav e reserva o espaco dela em rotas normais (ex: /search)", () => {
    renderWithProviders(<ConsumerAppShell />, { route: "/search" });

    expect(screen.getByRole("navigation")).toBeInTheDocument();
    // O espaco sai de `--bottom-nav-space` (altura da barra + recorte do iPhone),
    // e nao de um valor cravado, senao a conta desencontra quando a barra muda.
    expect(document.querySelector("main")?.className).toContain(
      "pb-[var(--bottom-nav-space)]",
    );
  });

  it("esconde a bottom nav e a reserva de espaco na página do estacionamento (/p/...)", () => {
    renderWithProviders(<ConsumerAppShell />, {
      route: "/p/ferapark/unidade-aeroporto/uncovered",
    });

    // Na página do estacionamento o rodapé fixo do mobile é o CTA de reserva.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(document.querySelector("main")?.className).not.toContain("--bottom-nav-space");
  });
});
