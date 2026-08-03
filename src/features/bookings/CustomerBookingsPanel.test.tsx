import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { CustomerBookingsPanel } from "./CustomerBookingsPanel";

const SUPABASE_URL = "http://localhost:54321";
const ANO = new Date().getFullYear();

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    code: "MP-1",
    status: "completed",
    check_in_at: `${ANO}-03-01T10:00:00Z`,
    check_out_at: `${ANO}-03-03T10:00:00Z`,
    expires_at: null,
    total_amount: 150,
    created_at: `${ANO}-02-01T10:00:00Z`,
    location: {
      name: "Unidade Aeroporto",
      slug: "u",
      address: "Rua Padre Celestino, 120",
      company: { name: "Virapark", slug: "virapark" },
      destination: { city: "Guarulhos", short_name: null },
    },
    booking_item: [{ item_type: "parking", parking_type: { name: "Coberto", code: "COB" } }],
    ...over,
  };
}

/** Uma reserva com check-in bem no futuro, pra nunca virar histórico com o tempo. */
const FUTURA = booking({
  id: "b2",
  code: "MP-2",
  status: "confirmed",
  check_in_at: "2099-08-03T22:00:00Z",
  check_out_at: "2099-08-08T08:00:00Z",
  total_amount: 149.5,
});

function render(bookings: unknown[], wallet: object = { transactions: [] }) {
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/booking`, ({ request }) => {
      // O card "Repetir reserva" pede uma linha só (maybeSingle).
      if (new URL(request.url).searchParams.get("limit") === "1") {
        return HttpResponse.json(null);
      }
      return HttpResponse.json(bookings);
    }),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/get_my_wallet`, () => HttpResponse.json(wallet)),
  );
  return renderWithProviders(<CustomerBookingsPanel detailBase="/account/reservas" />, {
    auth: mockAuth({ session: mockSession("customer") }),
    route: "/account/reservas",
  });
}

describe("CustomerBookingsPanel", () => {
  it("põe a próxima reserva em destaque, com o que o viajante precisa na portaria", async () => {
    render([booking(), FUTURA]);

    expect(await screen.findByText("Próxima reserva")).toBeInTheDocument();
    expect(screen.getByText("Rua Padre Celestino, 120", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver voucher" })).toHaveAttribute(
      "href",
      "/account/reservas/MP-2",
    );
  });

  /** Em uso ganha da futura: é a reserva que está acontecendo agora. */
  it("com uma reserva em uso, ela toma o lugar da futura", async () => {
    render([FUTURA, booking({ id: "b3", code: "MP-3", status: "checked_in" })]);
    expect(await screen.findByText("Reserva em uso")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver voucher" })).toHaveAttribute(
      "href",
      "/account/reservas/MP-3",
    );
  });

  it("soma o ano a partir do que já foi consumido", async () => {
    render([booking(), booking({ id: "b4", code: "MP-4", total_amount: 90 }), FUTURA], {
      transactions: [
        { amount_cents: 1840, kind: "cashback", created_at: `${ANO}-04-01T10:00:00Z` },
      ],
    });

    expect(await screen.findByText("Seu ano até agora")).toBeInTheDocument();
    // 150 + 90; a futura (149,50) não conta porque ainda não aconteceu.
    expect(screen.getByText("R$ 240,00")).toBeInTheDocument();
    expect(screen.getByText(/2 estadias/)).toBeInTheDocument();
    expect(screen.getByText("R$ 18,40")).toBeInTheDocument();
    expect(screen.getByText("Guarulhos")).toBeInTheDocument();
  });

  it("filtra o histórico pelos chips, e só mostra chip que tem resultado", async () => {
    const user = userEvent.setup();
    render([booking(), FUTURA]);

    await screen.findByText("Histórico");
    // Sem reserva cancelada, o chip de cancelada não aparece.
    expect(screen.queryByRole("button", { name: "Canceladas" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Concluídas" }));
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /R\$ 149,50/ })).not.toBeInTheDocument(),
    );
  });

  it("sem nenhuma reserva, convida a buscar em vez de mostrar tabela vazia", async () => {
    render([]);
    expect(await screen.findByText("Você ainda não tem reservas.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buscar vaga" })).toHaveAttribute("href", "/search");
  });

  it("pagina o histórico em vez de despejar tudo numa rolagem só", async () => {
    const user = userEvent.setup();
    const muitas = Array.from({ length: 23 }, (_, i) =>
      booking({ id: `h${i}`, code: `MP-H${i}`, total_amount: 10 + i }),
    );
    render(muitas);

    await screen.findByText("Histórico");
    expect(screen.getByText("1 a 5 de 23 reservas")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);

    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(await screen.findByText("6 a 10 de 23 reservas")).toBeInTheDocument();

    // Até a última: 23 em páginas de 5 dão 5 páginas, e a última fica com 3.
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole("button", { name: "Próxima página" }));
    }
    expect(await screen.findByText("21 a 23 de 23 reservas")).toBeInTheDocument();
    // Última página: não dá pra avançar mais.
    expect(screen.getByRole("button", { name: "Próxima página" })).toBeDisabled();
  });

  /** Trocar de filtro na página 3 deixaria a lista vazia sem explicação. */
  it("trocar de filtro volta pra primeira página", async () => {
    const user = userEvent.setup();
    const muitas = Array.from({ length: 23 }, (_, i) =>
      booking({ id: `h${i}`, code: `MP-H${i}` }),
    );
    render([...muitas, FUTURA]);

    await screen.findByText("Histórico");
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(await screen.findByText(/^6 a 10/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Concluídas" }));
    expect(await screen.findByText(/^1 a 5/)).toBeInTheDocument();
  });

  it("cabendo tudo numa página, o paginador some", async () => {
    render([booking(), FUTURA]);
    await screen.findByText("Histórico");
    expect(screen.queryByRole("navigation", { name: "Páginas do histórico" })).not.toBeInTheDocument();
  });

  /** Numa lista longa, o selo sozinho no canto não diferencia nada. */
  it("a data da linha carrega a cor do status", async () => {
    render([booking({ status: "cancelled" })]);
    const linha = (await screen.findAllByRole("listitem"))[0];
    const bloco = linha.querySelector("span");
    expect(bloco?.className).toContain("bg-badge-cancelled-bg");
  });
});
