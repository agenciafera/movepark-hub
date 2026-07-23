import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { FareEditor } from "./FareEditor";
import { useAdminSetFare, useFareAdminList, type FareAdminRow } from "./api";

// O gate de papel é server-authoritative (admin_set_fare exige is_hub_admin,
// coberto no pgTAP) e a rota /manager/tarifas fica sob RequireRole hub_admin.
// Aqui o foco é o comportamento do editor: render, Básica grátis e salvar.
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, useFareAdminList: vi.fn(), useAdminSetFare: vi.fn() };
});

const basica: FareAdminRow = {
  tier: "basica",
  label: "Básica",
  price_cents: 0,
  cancel_window_minutes: 1440,
  is_active: true,
  is_popular: false,
  sort_order: 0,
  benefits: { guaranteed_spot: true },
};
const flex: FareAdminRow = {
  tier: "flex",
  label: "Flex",
  price_cents: 1290,
  cancel_window_minutes: 1440,
  is_active: true,
  is_popular: true,
  sort_order: 1,
  benefits: { guaranteed_spot: true, free_cancellation: true },
};
const superflex: FareAdminRow = {
  tier: "superflex",
  label: "Superflex",
  price_cents: 2490,
  cancel_window_minutes: 1,
  is_active: true,
  is_popular: false,
  sort_order: 2,
  benefits: {},
};

function setup(rows: FareAdminRow[]) {
  const mutateAsync = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useFareAdminList).mockReturnValue({
    data: rows,
    isLoading: false,
    isError: false,
  } as never);
  vi.mocked(useAdminSetFare).mockReturnValue({ mutateAsync, isPending: false } as never);
  renderWithProviders(<FareEditor />);
  return { mutateAsync };
}

describe("FareEditor", () => {
  it("mostra um card por tarifa", () => {
    setup([basica, flex, superflex]);
    expect(screen.getByText("Básica")).toBeInTheDocument();
    expect(screen.getByText("Flex")).toBeInTheDocument();
    expect(screen.getByText("Superflex")).toBeInTheDocument();
  });

  it("a Básica não tem campo de preço: é sempre grátis", () => {
    setup([basica]);
    expect(screen.getByText("Sempre grátis")).toBeInTheDocument();
  });

  it("Salvar começa desabilitado e envia a linha editada", async () => {
    const { mutateAsync } = setup([flex]);
    const salvar = screen.getByRole("button", { name: "Salvar" });
    expect(salvar).toBeDisabled();

    // Desligar a tarifa deixa o formulário sujo e habilita o Salvar.
    await userEvent.click(screen.getByRole("switch", { name: /Flex ativa/ }));
    expect(salvar).toBeEnabled();

    await userEvent.click(salvar);
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "flex", is_active: false }),
    );
  });
});
