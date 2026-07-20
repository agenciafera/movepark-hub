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
              photos: ["https://cdn.movepark.co/lote.jpg"],
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

    // Mesma hierarquia do card da busca: operador no título, unidade e tipo abaixo.
    expect(await screen.findByText("Ferapark")).toBeInTheDocument();
    expect(screen.getByText(/Unidade Aeroporto · Vaga Descoberta/)).toBeInTheDocument();
    // Capa vem da 1ª foto da galeria, como na busca.
    expect(screen.getByRole("img", { name: "Unidade Aeroporto" })).toHaveAttribute(
      "src",
      "https://cdn.movepark.co/lote.jpg",
    );
    // Link pra página do estacionamento.
    const link = screen.getAllByRole("link").find((a) =>
      a.getAttribute("href")?.includes("/p/ferapark/unidade-aeroporto/uncovered"),
    );
    expect(link).toBeTruthy();
  });

  // Regressão: os breakpoints do projeto são `tablet:`/`desktop:` (tailwind.config.ts
  // sobrescreve `screens`). Com `sm:`/`lg:` o grid ficava em 1 coluna no desktop e os
  // cards saíam gigantes.
  it("usa os breakpoints do projeto no grid (2 colunas no tablet, 3 no desktop)", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/profile_saved`, () =>
        HttpResponse.json([{ location_parking_type_id: "lpt-1" }]),
      ),
      http.get(`${SUPABASE_URL}/rest/v1/location_parking_type`, () =>
        HttpResponse.json([
          {
            id: "lpt-1",
            location: {
              slug: "unidade-aeroporto",
              name: "Unidade Aeroporto",
              address: null,
              photos: [],
              company: { slug: "ferapark", name: "Ferapark" },
            },
            company_parking_type: {
              parking_type: { code: "uncovered", name: "Vaga Descoberta" },
            },
          },
        ]),
      ),
    );

    const { container } = renderWithProviders(<SavedPage />, {
      auth: mockAuth({ session: mockSession("customer", { userId: "u1" }) }),
    });

    await screen.findByText("Ferapark");
    const grid = container.querySelector("div.grid");
    expect(grid?.className).toContain("tablet:grid-cols-2");
    expect(grid?.className).toContain("desktop:grid-cols-3");
    expect(grid?.className).not.toContain("sm:grid-cols-2");
    expect(grid?.className).not.toContain("lg:grid-cols-3");
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
