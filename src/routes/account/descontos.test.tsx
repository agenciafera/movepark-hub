import { describe, expect, it, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { server } from "@/test/msw/server";
import { getStoredCoupon, clearStoredCoupon } from "@/lib/coupon";
import DescontosPage from "./descontos";

const SUPABASE_URL = "http://localhost:54321";

/**
 * A tela de descontos tem dois modos, e o que os separa é a reserva em andamento. Os testes abaixo
 * cobrem exatamente essa bifurcação, porque errar nela é o pior defeito possível aqui: o cliente
 * escolhe um cupom, a tela diz que deu certo, e o desconto não entra em lugar nenhum.
 */

const CUPOM = {
  id: "cup-1",
  code: "BEMVINDO30",
  title: "Primeira reserva",
  terms: "Vale na sua primeira reserva. 30% de desconto, até R$ 40.",
  discount_type: "percent",
  discount_value: 30,
  max_discount_amount: 40,
  min_amount: null,
  min_days: null,
  valid_until: null,
  scope: "platform",
  company_name: null,
  audience: "first_purchase",
  is_redeemed: false,
  is_best: false,
  discount: 0,
};

/** A RPC da carteira e a da reserva em andamento, que toda renderização da tela chama. */
function stubCarteira(opts: { reserva?: unknown; item?: Record<string, unknown> }) {
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/booking`, () =>
      HttpResponse.json(opts.reserva ?? null),
    ),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/customer_coupon_wallet`, () =>
      HttpResponse.json({
        items: [{ ...CUPOM, ...(opts.item ?? {}) }],
        has_order_context: Boolean(opts.reserva),
      }),
    ),
  );
}

describe("DescontosPage, /account/descontos", () => {
  beforeEach(() => clearStoredCoupon());

  it("sem reserva aberta, guarda o cupom para a próxima", async () => {
    // Sem pedido para julgar, o cartão não promete "disponível": ele oferece guardar, e o cupom
    // entra sozinho na próxima reserva pelo mesmo canal do link de campanha.
    stubCarteira({ reserva: null, item: { is_eligible: null } });

    renderWithProviders(<DescontosPage />, {
      auth: mockAuth({ session: mockSession("customer", { userId: "u1" }) }),
    });

    const botao = await screen.findByRole("button", { name: "Guardar" });
    await userEvent.click(botao);

    await waitFor(() => expect(getStoredCoupon()).toBe("BEMVINDO30"));
    expect(await screen.findByText("Vai na próxima reserva")).toBeInTheDocument();
  });

  it("com reserva aberta, aplica na reserva em vez de só guardar", async () => {
    let corpoEnviado: unknown = null;
    stubCarteira({
      reserva: { id: "bk-1", code: "MP-ABC123", expires_at: "2099-01-01T00:00:00Z", location: { name: "Aerovalet" } },
      item: { is_eligible: true, discount: 40, is_best: true },
    });
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/rpc/apply_coupon_to_booking`, async ({ request }) => {
        corpoEnviado = await request.json();
        return HttpResponse.json({ ok: true, discount: 40, total_amount: 160 });
      }),
    );

    renderWithProviders(<DescontosPage />, {
      auth: mockAuth({ session: mockSession("customer", { userId: "u1" }) }),
    });

    // O aviso da reserva aberta é o que explica por que o botão aplica em vez de guardar.
    expect(await screen.findByText(/reserva em andamento/i)).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "Usar" }));

    await waitFor(() =>
      expect(corpoEnviado).toEqual({ p_booking_id: "bk-1", p_code: "BEMVINDO30" }),
    );
    // Guardar na sessão aqui seria errado: o cupom já está na reserva, e o resíduo entraria de
    // novo na reserva seguinte sem ninguém pedir.
    expect(getStoredCoupon()).toBeNull();
  });

  it("cupom indisponível não oferece botão, mostra o motivo", async () => {
    stubCarteira({
      reserva: { id: "bk-1", code: "MP-ABC123", expires_at: "2099-01-01T00:00:00Z", location: { name: "Aerovalet" } },
      item: { is_eligible: false, reason: "not_first_purchase" },
    });

    renderWithProviders(<DescontosPage />, {
      auth: mockAuth({ session: mockSession("customer", { userId: "u1" }) }),
    });

    expect(await screen.findByText("Vale só na primeira reserva")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usar" })).not.toBeInTheDocument();
  });
});
