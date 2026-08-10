import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

/**
 * O card do ano, escopado. Os mesmos valores aparecem nas linhas da lista, então
 * asserção solta na tela inteira casa com o card errado.
 */
async function cardDoAno() {
  const titulo = await screen.findByText("Seu ano até agora");
  return within(titulo.closest("section")!);
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

    const card = await cardDoAno();
    // 150 + 90; a futura (149,50) não conta porque ainda não aconteceu.
    expect(card.getByText("R$ 240,00")).toBeInTheDocument();
    expect(card.getByText(/2 estadias/)).toBeInTheDocument();
    // Sem cupom nem promoção, a economia do ano é só o cashback, então o valor
    // aparece duas vezes: no destaque e na linha que diz de onde ele veio.
    expect(card.getAllByText("R$ 18,40")).toHaveLength(2);
    expect(card.getByText("Guarulhos")).toBeInTheDocument();
  });

  it("com cupom, o destaque vira a economia e o gasto continua na tela", async () => {
    render([
      booking({ total_amount: 150, booking_coupon: [{ discount_applied: 30 }] }),
      booking({
        id: "b4",
        code: "MP-4",
        total_amount: 90,
        price_breakdown: { auto_discount: { amount: 12 } },
      }),
    ]);

    const card = await cardDoAno();
    expect(card.getByText(/economizados em 2 estadias/)).toBeInTheDocument();
    expect(card.getByText("R$ 42,00")).toBeInTheDocument(); // 30 + 12
    expect(card.getByText("Cupons")).toBeInTheDocument();
    expect(card.getByText("R$ 30,00")).toBeInTheDocument();
    expect(card.getByText("Promoções")).toBeInTheDocument();
    expect(card.getByText("R$ 12,00")).toBeInTheDocument();
    // O gasto não some quando a economia assume o destaque.
    expect(card.getByText("Você gastou")).toBeInTheDocument();
    expect(card.getByText("R$ 240,00")).toBeInTheDocument();
  });

  it("conta a diferença contra o preço de balcão da unidade", async () => {
    render([
      booking({
        total_amount: 19.9,
        price_breakdown: { old_price: 23.88, subtotal: 19.9, auto_discount: null },
      }),
    ]);

    const card = await cardDoAno();
    expect(card.getByText("Mais barato que no local")).toBeInTheDocument();
    // 23,88 de balcão contra 19,90 online. Duas vezes na tela: destaque e linha.
    expect(card.getAllByText("R$ 3,98")).toHaveLength(2);
  });

  /**
   * Com desconto automático, `old_price` é o preço ANTES do desconto, então
   * `old_price − subtotal` é o próprio desconto. Contar as duas coisas dobraria a
   * economia. Ver "Old Price / Preço de Balcão" em docs/specs/pricing-engine.md.
   */
  it("com promoção, a âncora não vira economia extra", async () => {
    render([
      booking({
        total_amount: 80,
        price_breakdown: {
          old_price: 100,
          subtotal: 80,
          auto_discount: { amount: 20, rule_id: "r1", label: "Promoção" },
        },
      }),
    ]);

    const card = await cardDoAno();
    expect(card.queryByText("Mais barato que no local")).not.toBeInTheDocument();
    expect(card.getByText("Promoções")).toBeInTheDocument();
    // 20 de promoção, e não 40. Aparece duas vezes: no destaque e na linha, já
    // que a promoção é a única economia do ano.
    expect(card.getAllByText("R$ 20,00")).toHaveLength(2);
    expect(card.queryByText("R$ 40,00")).not.toBeInTheDocument();
  });

  /** Unidade sem tabela de balcão não estima nada: a linha simplesmente não existe. */
  it("sem preço de balcão declarado, a linha não aparece", async () => {
    render([booking({ total_amount: 150, price_breakdown: { subtotal: 150 } })]);

    const card = await cardDoAno();
    expect(card.queryByText("Mais barato que no local")).not.toBeInTheDocument();
  });

  /** Sem nenhuma economia, o card segue mostrando o gasto e não anuncia zero. */
  it("sem economia, o destaque continua sendo o gasto", async () => {
    render([booking({ total_amount: 150 })]);

    const card = await cardDoAno();
    expect(card.getByText("R$ 150,00")).toBeInTheDocument();
    expect(card.queryByText(/economizados/)).not.toBeInTheDocument();
    expect(card.queryByText("Cupons")).not.toBeInTheDocument();
    expect(card.queryByText("Você gastou")).not.toBeInTheDocument();
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
