import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { ChangeDatesPaidDialog } from "./ChangeDatesPaidDialog";

const h = vi.hoisted(() => ({ cotar: vi.fn(), trocar: vi.fn() }));
vi.mock("./customerApi", () => ({
  useQuotePaidBookingDates: () => ({ mutateAsync: h.cotar, isPending: false }),
  useChangePaidBookingDates: () => ({ mutateAsync: h.trocar, isPending: false }),
}));
// O cartão tem teste e Edge próprios; aqui só importa que ele aparece quando o cliente pode usar.
vi.mock("./DateChangeCardForm", () => ({ DateChangeCardForm: () => <p>formulário do cartão</p> }));

const COTA = {
  mode: "quote", available: true, reason: null, days: 3, days_before: 5, price_source: "compra",
  current_total: 157.4, new_total: 99.6, delta: -57.8, delta_cents: -5780, effect: "refund", card_allowed: false,
};

function abrir() {
  return renderWithProviders(
    <ChangeDatesPaidDialog
      bookingCode="MP7K2X"
      currentCheckIn="2027-03-10T08:00:00Z"
      currentCheckOut="2027-03-15T08:00:00Z"
      open
      onOpenChange={() => {}}
    />,
  );
}

describe("ChangeDatesPaidDialog", () => {
  beforeEach(() => {
    h.cotar.mockReset();
    h.trocar.mockReset();
  });

  it("mostra quanto volta antes de confirmar, e confirma com a diferença que o cliente viu", async () => {
    const user = userEvent.setup();
    h.cotar.mockResolvedValue(COTA);
    h.trocar.mockResolvedValue({ mode: "applied", delta: -57.8, total_amount: 99.6, refunded: true, refund_pending: false });
    abrir();
    await user.click(screen.getByRole("button", { name: "Ver o valor" }));
    expect(await screen.findByText(/Você recebe R\$\s?57,80 de volta/)).toBeTruthy();
    expect(h.trocar).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar novas datas" }));
    await waitFor(() => expect(h.trocar).toHaveBeenCalledTimes(1));
    expect(h.trocar.mock.calls[0][0]).toMatchObject({ bookingCode: "MP7K2X", expectedDeltaCents: -5780 });
  });

  it("mais caro: oferece PIX e cartão; sem cobrar nada até a escolha", async () => {
    const user = userEvent.setup();
    h.cotar.mockResolvedValue({ ...COTA, delta: 25.7, delta_cents: 2570, effect: "charge", card_allowed: true });
    abrir();
    await user.click(screen.getByRole("button", { name: "Ver o valor" }));
    expect(await screen.findByText(/A diferença é R\$\s?25,70/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Cartão" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pagar R\$\s?25,70 no PIX/ })).toBeTruthy();
    expect(h.trocar).not.toHaveBeenCalled();
  });

  it("período que a unidade não vende: o motivo e nenhum botão de confirmar", async () => {
    const user = userEvent.setup();
    h.cotar.mockResolvedValue({ ...COTA, available: false, delta: null, delta_cents: null, effect: null, reason: "Nesta unidade o mínimo é de 3 diárias." });
    abrir();
    await user.click(screen.getByRole("button", { name: "Ver o valor" }));
    expect(await screen.findByText("Nesta unidade o mínimo é de 3 diárias.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar novas datas" })).toBeNull();
  });
});
