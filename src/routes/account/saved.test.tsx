import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { server } from "@/test/msw/server";
import SavedPage from "./saved";

const SUPABASE_URL = "http://localhost:54321";

describe("SavedPage — /account/saved", () => {
  it("lista os estacionamentos favoritados do usuário", async () => {
    server.use(
      // Ids salvos do usuário.
      http.get(`${SUPABASE_URL}/rest/v1/profile_saved`, () =>
        HttpResponse.json([{ location_parking_type_id: "lpt-1" }]),
      ),
      // Detalhe do LPT salvo (operador + unidade + tipo de vaga).
      http.get(`${SUPABASE_URL}/rest/v1/location_parking_type`, () =>
        HttpResponse.json([
          {
            id: "lpt-1",
            location: {
              slug: "unidade-aeroporto",
              name: "Unidade Aeroporto",
              address: "Rua X, 100",
              company: { slug: "ferapark", name: "Ferapark" },
            },
            company_parking_type: {
              parking_type: { code: "uncovered", name: "Vaga Descoberta" },
            },
          },
        ]),
      ),
    );

    renderWithProviders(<SavedPage />, {
      auth: mockAuth({ session: mockSession("customer", { userId: "u1" }) }),
    });

    // O card do favorito aparece com operador, unidade e tipo de vaga.
    expect(await screen.findByText(/Vaga Descoberta · Ferapark/)).toBeInTheDocument();
    expect(screen.getByText("Unidade Aeroporto")).toBeInTheDocument();
    // Link pra página do estacionamento.
    const link = screen.getAllByRole("link").find((a) =>
      a.getAttribute("href")?.includes("/p/ferapark/unidade-aeroporto/uncovered"),
    );
    expect(link).toBeTruthy();
  });

  it("mostra estado vazio quando não há favoritos", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/profile_saved`, () => HttpResponse.json([])),
    );

    renderWithProviders(<SavedPage />, {
      auth: mockAuth({ session: mockSession("customer", { userId: "u1" }) }),
    });

    expect(await screen.findByText("Nada salvo por aqui")).toBeInTheDocument();
  });
});
