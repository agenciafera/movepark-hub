import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { ChangeDatesPaidDialog } from "./ChangeDatesPaidDialog";

const h = vi.hoisted(() => ({ cotar: vi.fn(), trocar: vi.fn() }));
vi.mock("./customerApi", () => ({
  useQuotePaidBookingDates: () => ({ mutateAsync: h.cotar, isPending: false }),
  useChangePaidBookingDates: () => ({ mutateAsync: h.trocar, isPending: false }),
}));
// O cartão tem teste e Edge próprios; aqui só importa que ele aparece quando o cliente pode usar.
vi.mock("./ExtraChargeCardForm", () => ({ ExtraChargeCardForm: () => <p>formulário do cartão</p> }));
vi.mock("@/lib/qr", () => ({ toDataUrl: () => Promise.resolve("data:image/png;base64,qr") }));
// O calendário real é de outro teste; aqui um botão estende a saída em um dia.
vi.mock("@/features/search/DateRangeField", () => ({
  DateRangeField: ({ mode, date, onChange }: { mode: string; date: Date | null; onChange: (d: Date) => void }) =>
    mode === "check-out" ? (
      <button type="button" onClick={() => date && onChange(new Date(date.getTime() + 86_400_000))}>
        mais um dia
      </button>
    ) : null,
}));

/** Render com React Query que sobrevive ao `rerender` (a reserva relida chega como props novas). */
function renderQ(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
}

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

  it("PIX da diferença: a tela espera e diz que deu certo quando a reserva relida tem as datas novas (26/11/2026)", async () => {
    const user = userEvent.setup();
    h.cotar.mockResolvedValue({ ...COTA, delta: 37.8, delta_cents: 3780, effect: "charge", card_allowed: true });
    h.trocar.mockResolvedValue({ mode: "charge", payment_id: "p9", delta: 37.8, qr_code: "pixdt", qr_code_url: "", expires_at: "2099-12-01T10:30:00Z" });
    const onWaitingChange = vi.fn();
    const props = { bookingCode: "MP7K2X", currentCheckIn: "2027-03-10T08:00:00Z", open: true, onOpenChange: () => {}, onWaitingChange };
    const r = renderQ(<ChangeDatesPaidDialog currentCheckOut="2027-03-15T08:00:00Z" {...props} />);
    await user.click(screen.getByRole("button", { name: "mais um dia" }));
    await user.click(screen.getByRole("button", { name: "Ver o valor" }));
    await user.click(await screen.findByRole("button", { name: /Pagar R\$\s?37,80 no PIX/ }));
    expect(await screen.findByTestId("pix-cobranca")).toBeTruthy();
    expect(onWaitingChange).toHaveBeenLastCalledWith(true);

    // A página relê a reserva: as datas pedidas chegam e o diálogo não volta para o calendário.
    const pedido = h.trocar.mock.calls[0][0] as { checkInAt: string; checkOutAt: string };
    r.rerender(<ChangeDatesPaidDialog {...props} currentCheckIn={pedido.checkInAt} currentCheckOut={pedido.checkOutAt} />);
    expect(await screen.findByTestId("pix-pago")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ver o valor" })).toBeNull();
    expect(onWaitingChange).toHaveBeenLastCalledWith(false);
  });
});
