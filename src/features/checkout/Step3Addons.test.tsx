import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { Step3Addons } from "./Step3Addons";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SUPABASE_URL = "http://localhost:54321";

const CATALOGO = [
  {
    price_override: null,
    add_on_service: {
      id: "a1",
      code: "autostart",
      name: "Auto Start",
      description: "Ligamos seu carro 2 a 3x por semana.",
      base_price: 20,
      is_active: true,
      sort_order: 1,
    },
  },
  {
    price_override: 12.9,
    add_on_service: {
      id: "a2",
      code: "capa",
      name: "Capa protetora",
      description: null,
      base_price: 15.9,
      is_active: true,
      sort_order: 2,
    },
  },
];

function render(catalogo: unknown[] = CATALOGO, selected: string[] = []) {
  const rpc = vi.fn();
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/location_add_on_service`, () =>
      HttpResponse.json(catalogo),
    ),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/set_booking_addons`, async ({ request }) => {
      rpc(await request.json());
      return HttpResponse.json({});
    }),
  );
  const onNext = vi.fn();
  const utils = renderWithProviders(
    <Step3Addons
      code="MP-1"
      locationId="loc-1"
      selectedIds={selected}
      onBack={vi.fn()}
      onNext={onNext}
    />,
    { auth: mockAuth({ session: mockSession("customer") }), route: "/checkout/MP-1" },
  );
  return { ...utils, rpc, onNext };
}

describe("Step3Addons", () => {
  it("lista o catálogo da unidade com o preço que vale ali", async () => {
    render();
    expect(await screen.findByText("Auto Start")).toBeInTheDocument();
    // O segundo tem override de 12,90: quem manda é a unidade, não o preço base.
    expect(screen.getByText("R$ 12,90")).toBeInTheDocument();
    expect(screen.queryByText("R$ 15,90")).not.toBeInTheDocument();
  });

  /** O passo grava só os ids: preço e total são recalculados no servidor. */
  it("manda apenas os ids escolhidos, nunca o preço", async () => {
    const user = userEvent.setup();
    const { rpc, onNext } = render();

    await user.click(await screen.findByRole("button", { name: /Auto Start/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const corpo = rpc.mock.calls[0][0];
    expect(corpo).toEqual({ p_code: "MP-1", p_add_on_ids: ["a1"] });
    expect(JSON.stringify(corpo)).not.toContain("20");
    expect(onNext).toHaveBeenCalled();
  });

  it("abre com o que já estava gravado na reserva", async () => {
    render(CATALOGO, ["a2"]);
    const capa = await screen.findByRole("button", { name: /Capa protetora/ });
    expect(capa).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Auto Start/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("sem nada marcado, o botão convida a seguir em frente", async () => {
    render();
    expect(await screen.findByRole("button", { name: "Seguir sem extras" })).toBeInTheDocument();
  });

  /** Passo vazio só alonga o funil: some sozinho quando a unidade não oferece nada. */
  it("unidade sem adicional pula o passo", async () => {
    const { onNext } = render([]);
    await waitFor(() => expect(onNext).toHaveBeenCalled());
    expect(screen.queryByText(/cuidado extra/)).not.toBeInTheDocument();
  });

  it("serviço desativado no catálogo não aparece", async () => {
    render([
      { ...CATALOGO[0], add_on_service: { ...CATALOGO[0].add_on_service, is_active: false } },
      CATALOGO[1],
    ]);
    expect(await screen.findByText("Capa protetora")).toBeInTheDocument();
    expect(screen.queryByText("Auto Start")).not.toBeInTheDocument();
  });
});
