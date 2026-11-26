import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/qr", () => ({ toDataUrl: () => Promise.resolve("data:image/png;base64,qr") }));
const cotar = vi.hoisted(() => vi.fn());
const estender = vi.hoisted(() => vi.fn());
vi.mock("./customerApi", () => ({
  useQuotePaidBookingDates: () => ({ mutateAsync: cotar, isPending: false }),
  useChangePaidBookingDates: () => ({ mutateAsync: estender, isPending: false }),
}));

import { ExtendStayPanel, type ExtendTarget } from "./ExtendStayPanel";

const sp = (t: string | null) => (t ?? "").replace(/\u00a0/g, " ");
const SAIDA = "2026-12-19T09:00:00.000Z";
const cotacao = {
  mode: "quote",
  available: true,
  reason: null,
  days: 10,
  days_before: 8,
  price_source: "compra",
  current_total: null,
  new_total: null,
  delta: 37.8,
  delta_cents: 3780,
  effect: "charge",
  card_allowed: false,
  charge_amount: 37.8,
  extension: true,
  access_provider: null,
};

function abre(checkOutAt = "2026-12-18T01:30:00Z") {
  const onWaitingChange = vi.fn();
  const alvo = (out: string): ExtendTarget => ({
    bookingCode: "MP-B59849",
    checkInAt: "2026-12-10T07:30:00Z",
    checkOutAt: out,
    onWaitingChange,
  });
  const r = render(<ExtendStayPanel alvo={alvo(checkOutAt)} saida={SAIDA} />);
  return { onWaitingChange, rerender: (out: string) => r.rerender(<ExtendStayPanel alvo={alvo(out)} saida={SAIDA} />) };
}

beforeEach(() => {
  cotar.mockReset();
  estender.mockReset();
});

describe("ExtendStayPanel", () => {
  it("cota pelo servidor em modo extensão, gera o PIX e avisa quando a saída nova entra", async () => {
    cotar.mockResolvedValue(cotacao);
    estender.mockResolvedValue({
      mode: "charge", payment_id: "p1", status: "pending", qr_code: "pixdias", qr_code_url: null,
      expires_at: "2026-12-19T09:30:00Z", delta: 37.8, charge_amount: 37.8,
    });
    const { onWaitingChange, rerender } = abre();
    fireEvent.click(screen.getByRole("button", { name: "Cobrar pelo Hub" }));
    expect(cotar).toHaveBeenCalledWith({
      bookingCode: "MP-B59849",
      checkInAt: "2026-12-10T07:30:00Z",
      checkOutAt: SAIDA,
      extend: true,
    });
    expect(sp((await screen.findByTestId("extensao-previa")).textContent)).toContain("O cliente paga R$ 37,80 no PIX");
    expect(screen.queryByTestId("aviso-cloudpark")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gerar o PIX" }));
    expect(await screen.findByTestId("pix-cobranca")).toBeInTheDocument();
    expect(estender).toHaveBeenCalledWith(expect.objectContaining({ extend: true, expectedDeltaCents: 3780 }));
    expect(onWaitingChange).toHaveBeenLastCalledWith(true);

    rerender("2026-12-19T09:00:00+00:00");
    expect(await screen.findByTestId("pix-pago")).toHaveTextContent("Pagamento recebido");
    expect(onWaitingChange).toHaveBeenLastCalledWith(false);
  });

  it("unidade com a cancela da Cloudpark avisa para ajustar a saída lá", async () => {
    cotar.mockResolvedValue({ ...cotacao, access_provider: "cloudpark" });
    abre();
    fireEvent.click(screen.getByRole("button", { name: "Cobrar pelo Hub" }));
    expect(await screen.findByTestId("aviso-cloudpark")).toHaveTextContent("Ajuste a saída deste cartão na Cloudpark");
  });

  it("sem diferença (pacote mais barato), estende a saída sem PIX", async () => {
    cotar.mockResolvedValue({ ...cotacao, delta: 0, delta_cents: 0, effect: "none", charge_amount: 0 });
    estender.mockResolvedValue({ mode: "applied", delta: 0, total_amount: null, refunded: false, refund_pending: false });
    abre();
    fireEvent.click(screen.getByRole("button", { name: "Cobrar pelo Hub" }));
    expect(await screen.findByText("Sem diferença a pagar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Estender a saída" }));
    expect(await screen.findByTestId("pix-pago")).toHaveTextContent("sem diferença a pagar");
  });

  it("o motivo do servidor aparece quando não dá para estender", async () => {
    cotar.mockResolvedValue({ ...cotacao, available: false, delta: null, delta_cents: null, reason: "Sem vaga para 19/12." });
    abre();
    fireEvent.click(screen.getByRole("button", { name: "Cobrar pelo Hub" }));
    expect(await screen.findByTestId("extensao-previa")).toHaveTextContent("Sem vaga para 19/12.");
    expect(screen.queryByRole("button", { name: "Gerar o PIX" })).not.toBeInTheDocument();
  });
});
