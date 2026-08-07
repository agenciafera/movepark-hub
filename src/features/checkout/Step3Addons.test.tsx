import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

const VEICULO = {
  id: "v1",
  profile_id: "u1",
  license_plate: "ABC1D23",
  model: "Ford Fiesta",
  color: "Prata",
  is_default: true,
  created_at: "2026-01-01T00:00:00Z",
};

function render(
  catalogo: unknown[] = CATALOGO,
  selected: string[] = [],
  veiculos: unknown[] = [VEICULO],
) {
  const rpc = vi.fn();
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/location_add_on_service`, () => HttpResponse.json(catalogo)),
    http.get(`${SUPABASE_URL}/rest/v1/vehicle`, () => HttpResponse.json(veiculos)),
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
      vehicleId="v1"
      operatorName="Abbapark"
      selectedIds={selected}
      onBack={vi.fn()}
      onNext={onNext}
    />,
    { auth: mockAuth({ session: mockSession("customer") }), route: "/checkout/MP-1" },
  );
  return { ...utils, rpc, onNext };
}

/** O card do serviço, pelo nome dele. */
async function card(nome: string) {
  const titulo = await screen.findByText(nome);
  return within(titulo.closest("li")!);
}

describe("Step3Addons", () => {
  it("lista o catálogo da unidade com o preço que vale ali", async () => {
    render();
    expect(await screen.findByText("Auto Start")).toBeInTheDocument();
    // O segundo tem override de 12,90: quem manda é a unidade, não o preço base.
    expect(screen.getByText("R$ 12,90")).toBeInTheDocument();
    expect(screen.queryByText("R$ 15,90")).not.toBeInTheDocument();
  });

  it("chama o carro pelo modelo e diz de quem é o serviço", async () => {
    render();
    expect(
      await screen.findByRole("heading", { name: "Quer algum cuidado extra com o Ford Fiesta?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Serviços do Abbapark/)).toBeInTheDocument();
  });

  it("sem modelo cadastrado, o título fala do carro sem inventar nome", async () => {
    render(CATALOGO, [], [{ ...VEICULO, model: null }]);
    expect(
      await screen.findByRole("heading", { name: "Quer algum cuidado extra com o seu carro?" }),
    ).toBeInTheDocument();
  });

  /** O passo grava só os ids: preço e total são recalculados no servidor. */
  it("manda apenas os ids escolhidos, nunca o preço", async () => {
    const user = userEvent.setup();
    const { rpc, onNext } = render();

    await user.click((await card("Auto Start")).getByRole("button", { name: "Adicionar" }));
    await user.click(screen.getByRole("button", { name: "Ir para o pagamento" }));

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const corpo = rpc.mock.calls[0][0];
    expect(corpo).toEqual({ p_code: "MP-1", p_add_on_ids: ["a1"] });
    expect(JSON.stringify(corpo)).not.toContain("20");
    expect(onNext).toHaveBeenCalled();
  });

  it("abre com o que já estava gravado na reserva", async () => {
    render(CATALOGO, ["a2"]);
    expect((await card("Capa protetora")).getByRole("button")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect((await card("Auto Start")).getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  /** Sem nada marcado ele faria o mesmo que o botão principal, então não existe. */
  it("o atalho de descartar só aparece quando há algo marcado", async () => {
    const user = userEvent.setup();
    render();
    await screen.findByText("Auto Start");
    expect(screen.queryByRole("button", { name: "Seguir sem extras" })).not.toBeInTheDocument();

    await user.click((await card("Auto Start")).getByRole("button", { name: "Adicionar" }));
    expect(screen.getByRole("button", { name: "Seguir sem extras" })).toBeInTheDocument();
  });

  it("descartar manda a lista vazia, não o que estava marcado", async () => {
    const user = userEvent.setup();
    const { rpc } = render(CATALOGO, ["a1"]);

    await user.click(await screen.findByRole("button", { name: "Seguir sem extras" }));

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc.mock.calls[0][0]).toEqual({ p_code: "MP-1", p_add_on_ids: [] });
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
