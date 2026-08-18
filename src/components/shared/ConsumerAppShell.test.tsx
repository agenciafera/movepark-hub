import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { server } from "@/test/msw/server";
import { ConsumerAppShell } from "./ConsumerAppShell";

describe("ConsumerAppShell", () => {
  // A Topbar dispara fetch de destinos; resolve com [] pra não deixar
  // requisição pendente até o teardown.
  beforeEach(() => {
    server.use(
      http.get("*/rest/v1/destination", () => HttpResponse.json([])),
      http.get("*/rest/v1/destination_point", () => HttpResponse.json([])),
    );
  });

  /**
   * A barra fixa embaixo saiu: no mobile ocupava 64px de tela em toda página e
   * repartia a navegação entre ela e o header, o que a avaliação de uso apontou
   * como confuso. Junto com ela sai a reserva de espaço, senão sobra um vão no
   * fim de toda página.
   */
  it.each([
    ["/search", "com sessão", mockSession("customer")],
    ["/search", "sem sessão", null],
    ["/p/ferapark/unidade-aeroporto/uncovered", "na página do estacionamento", null],
  ])("não tem barra fixa embaixo em %s (%s)", (route, _caso, session) => {
    renderWithProviders(<ConsumerAppShell />, { route, auth: mockAuth({ session }) });

    expect(document.querySelector("nav.grid-cols-4")).toBeNull();
    expect(document.querySelector("main")?.className).not.toContain("--bottom-nav-space");
  });

  /**
   * O canto inferior direito comporta uma bolinha só. O assistente do site está
   * desligado por build (`assistenteDoSiteLigado`) enquanto quem responde é a
   * equipe no WhatsApp, então o que sobe ali é a bolinha de WhatsApp. Se as duas
   * aparecerem juntas, uma cobre a outra.
   */
  it("mostra a bolinha de WhatsApp e não a do assistente", () => {
    renderWithProviders(<ConsumerAppShell />, { route: "/", auth: mockAuth() });

    expect(screen.getByRole("link", { name: /WhatsApp/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Abrir assistente")).toBeNull();
  });

  /** A navegação do mobile passou a ser só a aba lateral, logado ou não. */
  it.each([
    ["com sessão", mockSession("customer")],
    ["sem sessão", null],
  ])("a aba lateral do mobile aparece %s", (_caso, session) => {
    renderWithProviders(<ConsumerAppShell />, {
      route: "/search",
      auth: mockAuth({ session }),
    });

    expect(screen.getByRole("button", { name: "Abrir menu" })).toBeInTheDocument();
  });
});
