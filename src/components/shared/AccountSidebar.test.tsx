import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { AccountSidebar } from "./AccountSidebar";

const SUPABASE_URL = "http://localhost:54321";

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    code: "MP-1",
    status: "confirmed",
    check_in_at: "2099-01-10T10:00:00Z",
    check_out_at: "2099-01-12T10:00:00Z",
    expires_at: null,
    total_amount: 100,
    created_at: "2026-01-01T10:00:00Z",
    location: {
      name: "Unidade",
      slug: "u",
      address: null,
      company: { name: "Virapark", slug: "virapark" },
      destination: null,
    },
    booking_item: [{ item_type: "parking", parking_type: { name: "Coberto", code: "COB" } }],
    ...over,
  };
}

function render(opts: { bookings?: unknown[]; vehicles?: unknown[]; tier?: string | null } = {}) {
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/booking`, () =>
      HttpResponse.json(opts.bookings ?? [booking()]),
    ),
    http.get(`${SUPABASE_URL}/rest/v1/vehicle`, () =>
      HttpResponse.json(opts.vehicles ?? [{ id: "v1" }, { id: "v2" }]),
    ),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/get_my_membership`, () =>
      HttpResponse.json(
        opts.tier === undefined ? { tier_name: "Prata" } : opts.tier && { tier_name: opts.tier },
      ),
    ),
  );
  return renderWithProviders(<AccountSidebar />, {
    auth: mockAuth({ session: mockSession("customer", { firstName: "Diego", fullName: "Diego Guedes" }) }),
    route: "/account/profile",
  });
}

describe("AccountSidebar", () => {
  it("agrupa a conta por intenção em vez de uma lista corrida", () => {
    render();
    for (const grupo of ["Minhas viagens", "Meus dados", "Conta"]) {
      expect(screen.getByText(grupo)).toBeInTheDocument();
    }
    // Um item de cada grupo, pra garantir que a lista não perdeu destino no caminho.
    expect(screen.getByRole("link", { name: /Minhas reservas/ })).toHaveAttribute(
      "href",
      "/account/reservas",
    );
    expect(screen.getByRole("link", { name: /Veículos/ })).toHaveAttribute(
      "href",
      "/account/vehicles",
    );
    expect(screen.getByRole("link", { name: /Segurança/ })).toHaveAttribute(
      "href",
      "/account/security",
    );
  });

  /** Contador inventado é pior que contador nenhum: tem que ser a contagem real. */
  it("os contadores vêm dos dados, e cada um do seu", async () => {
    // Números diferentes de propósito: com 2 e 2 o teste passaria mesmo trocados.
    render({
      bookings: [booking(), booking({ id: "b2", code: "MP-2" })],
      vehicles: [{ id: "v1" }, { id: "v2" }, { id: "v3" }],
    });

    const reservas = await screen.findByRole("link", { name: /Minhas reservas/ });
    await waitFor(() => expect(within(reservas).getByText("2")).toBeInTheDocument());

    const veiculos = screen.getByRole("link", { name: /Veículos/ });
    await waitFor(() => expect(within(veiculos).getByText("3")).toBeInTheDocument());
  });

  it("sem nada cadastrado, não pinta badge zerado", async () => {
    render({ bookings: [], vehicles: [] });
    const reservas = await screen.findByRole("link", { name: /Minhas reservas/ });
    await waitFor(() => expect(within(reservas).queryByText("0")).not.toBeInTheDocument());
  });

  it("mostra quem é o dono da conta e o nível do clube", async () => {
    render({ tier: "Turbo" });
    expect(screen.getByText("Diego")).toBeInTheDocument();
    // Iniciais do avatar, as mesmas da topbar.
    expect(screen.getByText("DG")).toBeInTheDocument();
    expect(await screen.findByText(/nível Turbo/)).toBeInTheDocument();
  });

  /** Sem membership, a linha do clube some em vez de mostrar "nível null". */
  it("sem clube, não mostra a linha de nível", async () => {
    render({ tier: null });
    await waitFor(() => expect(screen.getByText("Diego")).toBeInTheDocument());
    expect(screen.queryByText(/nível/)).not.toBeInTheDocument();
  });
});
