import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import type { ManualRefundRow } from "@/features/payouts/api";

const fila: ManualRefundRow[] = [
  {
    id: "r1", booking_id: "b1", payment_id: "p1", amount_cents: 16240, reason: "gateway_deadline",
    status: "pending", note: null, created_at: "2026-09-15T10:00:00Z", paid_at: null,
    booking: { code: "MP-4715F4", customer_name: "Ana", customer_email: "ana@ex.com" },
  },
  {
    id: "r2", booking_id: "b2", payment_id: "p2", amount_cents: 3090, reason: "gateway_refused",
    status: "paid", note: "feito", created_at: "2026-09-10T10:00:00Z", paid_at: "2026-09-11T10:00:00Z",
    booking: { code: "MP-B27660", customer_name: "Bia", customer_email: null },
  },
];
const tentar = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, status: "refunded", refund_pending: false }));
const marcar = vi.fn().mockResolvedValue(undefined);

vi.mock("@/features/payouts/api", () => ({
  useManualRefunds: () => ({ data: fila, isLoading: false }),
  useMarkManualRefundPaid: () => ({ mutateAsync: marcar, isPending: false }),
  useRetryManualRefund: () => ({ mutateAsync: tentar, isPending: false }),
}));

import { ManualRefundQueueCard } from "./ManualRefundQueueCard";

const norm = (s: string | null) => (s ?? "").replace(/\u00a0/g, " ");

describe("ManualRefundQueueCard", () => {
  beforeEach(() => marcar.mockClear());

  it("mostra só os pendentes, com reserva, cliente, valor e motivo", () => {
    renderWithProviders(<ManualRefundQueueCard />);
    expect(screen.getByText("MP-4715F4")).toBeInTheDocument();
    expect(screen.queryByText("MP-B27660")).toBeNull();
    const linha = screen.getByText("MP-4715F4").closest("tr")!;
    expect(norm(linha.textContent)).toContain("R$ 162,40");
    expect(linha.textContent).toContain("Prazo do meio de pagamento venceu");
  });

  it("tenta o estorno de novo no gateway pela linha da fila", async () => {
    renderWithProviders(<ManualRefundQueueCard />);
    await userEvent.click(screen.getAllByRole("button", { name: "Tentar de novo no gateway" })[0]);
    await waitFor(() => expect(tentar).toHaveBeenCalledWith({ id: expect.any(String) }));
  });

  it("marca como pago só depois da confirmação, levando a observação", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ManualRefundQueueCard />);
    await user.click(screen.getByRole("button", { name: "Marcar como pago" }));
    expect(marcar).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Como foi devolvido"), "PIX em 15/09");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(marcar).toHaveBeenCalledWith({ id: "r1", note: "PIX em 15/09" }));
  });
});
