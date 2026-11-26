import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/qr", () => ({ toDataUrl: () => Promise.resolve("data:image/png;base64,qr") }));
// O seletor de datas de verdade é um calendário; aqui um botão escolhe a saída nova (19/12, +1 diária).
vi.mock("@/features/search/DateRangeField", () => ({
  DateRangeField: ({ mode, onChange }: { mode: string; onChange: (d: Date) => void }) =>
    mode === "check-out" ? (
      <button type="button" onClick={() => onChange(new Date("2099-12-19T10:00:00.000Z"))}>
        saída 19/12
      </button>
    ) : null,
}));

const cotar = vi.hoisted(() => vi.fn());
const trocar = vi.hoisted(() => vi.fn());
const upgrade = vi.hoisted(() => vi.fn());
vi.mock("./customerApi", () => ({
  useQuotePaidBookingDates: () => ({ mutateAsync: cotar, isPending: false }),
  useChangePaidBookingDates: () => ({ mutateAsync: trocar, isPending: false }),
}));
vi.mock("@/features/fares/api", () => ({
  useCreateFareUpgrade: () => ({ mutateAsync: upgrade, isPending: false }),
}));

import { StaffChangeDatesDialog, type StaffBooking } from "./StaffChangeDatesDialog";

const reserva: StaffBooking = {
  code: "MP-1",
  check_in_at: "2099-12-10T10:00:00.000Z",
  check_out_at: "2099-12-18T10:00:00.000Z",
  fare_tier: "basica",
};
const cotacao = {
  mode: "quote",
  available: true,
  reason: null,
  days: 8,
  days_before: 8,
  price_source: "compra",
  current_total: null,
  new_total: null,
  card_allowed: false,
};
const sp = (t: string | null) => (t ?? "").replace(/\u00a0/g, " ");

function abre(b: StaffBooking = reserva, canWaiveUpgrade = false) {
  const onWaiting = vi.fn();
  const props = { canWaiveUpgrade, open: true, onOpenChange: vi.fn(), onWaitingChange: onWaiting };
  const r = render(<StaffChangeDatesDialog booking={b} {...props} />);
  return { ...r, onWaiting, rerender: (nb: StaffBooking) => r.rerender(<StaffChangeDatesDialog booking={nb} {...props} />) };
}

beforeEach(() => {
  cotar.mockReset();
  trocar.mockReset();
  upgrade.mockReset();
});

describe("StaffChangeDatesDialog", () => {
  it("Básica com diária a mais: um PIX com a diferença e o upgrade, e avisa quando entra", async () => {
    cotar.mockResolvedValue({
      ...cotacao,
      delta: 18.9,
      delta_cents: 1890,
      effect: "charge",
      fare_upgrade: { tier: "flex", cents: 1290, amount: 12.9 },
      fare_upgrade_first: false,
      charge_amount: 31.8,
    });
    trocar.mockResolvedValue({
      mode: "charge",
      payment_id: "p1",
      status: "pending",
      qr_code: "00020126pix",
      qr_code_url: null,
      expires_at: "2099-12-01T10:30:00Z",
      delta: 18.9,
      charge_amount: 31.8,
    });
    const { onWaiting, rerender } = abre();
    fireEvent.click(screen.getByRole("button", { name: "saída 19/12" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver o valor" }));
    expect(sp((await screen.findByTestId("cotacao-equipe")).textContent)).toContain("O cliente paga R$ 31,80 no PIX");
    fireEvent.click(screen.getByRole("button", { name: "Gerar o PIX" }));
    expect(await screen.findByTestId("pix-cobranca")).toBeInTheDocument();
    expect(trocar).toHaveBeenCalledWith(expect.objectContaining({ bookingCode: "MP-1", expectedDeltaCents: 1890, waiveFareUpgrade: false }));
    expect(onWaiting).toHaveBeenLastCalledWith(true);

    // Enquanto a reserva relida não tem as datas novas, segue esperando.
    rerender({ ...reserva });
    expect(screen.getByTestId("pix-cobranca")).toBeInTheDocument();
    // A reserva relida já tem a saída nova: o PIX entrou.
    rerender({ ...reserva, check_out_at: "2099-12-19T10:00:00+00:00", fare_tier: "flex" });
    expect(await screen.findByTestId("pix-pago")).toHaveTextContent("Pagamento recebido");
    expect(onWaiting).toHaveBeenLastCalledWith(false);
  });

  it("Básica encurtando: PIX do upgrade primeiro e, quando ele entra, a troca vai sozinha", async () => {
    cotar.mockResolvedValue({
      ...cotacao,
      delta: -18.9,
      delta_cents: -1890,
      effect: "refund",
      fare_upgrade: { tier: "flex", cents: 1290, amount: 12.9 },
      fare_upgrade_first: true,
      charge_amount: 0,
    });
    upgrade.mockResolvedValue({ payment_id: "u1", status: "pending", qr_code: "pixup", qr_code_url: "", expires_at: "2099-12-01T10:30:00Z", delta: 12.9 });
    trocar.mockResolvedValue({ mode: "applied", delta: -18.9, total_amount: null, refunded: true, refund_pending: false });
    const { rerender } = abre();
    fireEvent.click(screen.getByRole("button", { name: "Ver o valor" }));
    fireEvent.click(await screen.findByRole("button", { name: "Gerar o PIX do upgrade" }));
    expect(upgrade).toHaveBeenCalledWith({ booking_code: "MP-1", target_tier: "flex" });
    expect(await screen.findByTestId("pix-cobranca")).toBeInTheDocument();
    expect(trocar).not.toHaveBeenCalled();

    rerender({ ...reserva, fare_tier: "flex" });
    await waitFor(() => expect(trocar).toHaveBeenCalledWith(expect.objectContaining({ expectedDeltaCents: -1890 })));
    expect(sp((await screen.findByTestId("pix-pago")).textContent)).toContain("Devolvemos R$ 18,90");
  });

  it("parceiro não vê a dispensa do upgrade; o Manager vê e precisa dizer o motivo", async () => {
    cotar.mockResolvedValue({
      ...cotacao,
      delta: 0,
      delta_cents: 0,
      effect: "none",
      fare_upgrade: { tier: "flex", cents: 1290, amount: 12.9 },
      fare_upgrade_first: true,
      charge_amount: 0,
    });
    const parceiro = abre();
    fireEvent.click(screen.getByRole("button", { name: "Ver o valor" }));
    await screen.findByTestId("cotacao-equipe");
    expect(screen.queryByLabelText(/Não cobrar o upgrade/)).not.toBeInTheDocument();
    parceiro.unmount();

    abre(reserva, true);
    fireEvent.click(screen.getByRole("button", { name: "Ver o valor" }));
    fireEvent.click(await screen.findByLabelText(/Não cobrar o upgrade/));
    // Com a dispensa, a prévia é refeita sem o upgrade.
    await waitFor(() => expect(cotar).toHaveBeenLastCalledWith(expect.objectContaining({ waiveFareUpgrade: true })));
  });
});
