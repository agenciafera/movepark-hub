import { describe, expect, it } from "vitest";
import {
  canDownloadVoucher,
  isVoucherReceipt,
  VOUCHER_BOOKING_STATUSES,
} from "./voucher.logic";

/**
 * C-15 do roteiro do consumidor. O defeito era divergência: a Edge `voucher-pdf` emitia para
 * `completed` e a tela escondia o botão, então reserva concluída tinha voucher válido no servidor e
 * nenhum jeito de baixar. https://app.clickup.com/t/86ajmy4d2
 */
describe("canDownloadVoucher", () => {
  it("libera nos três estados que o servidor emite", () => {
    expect(canDownloadVoucher("confirmed")).toBe(true);
    expect(canDownloadVoucher("checked_in")).toBe(true);
    expect(canDownloadVoucher("completed")).toBe(true);
  });

  it("bloqueia antes da confirmação e nos estados terminais sem estadia", () => {
    expect(canDownloadVoucher("pending")).toBe(false);
    expect(canDownloadVoucher("cancelled")).toBe(false);
    expect(canDownloadVoucher("no_show")).toBe(false);
  });

  it("a lista espelha a do servidor (_shared/voucher/fields.ts)", () => {
    // Guarda contra a divergência que originou o bug: se a Edge mudar, este teste falha e obriga a
    // atualizar os dois lados juntos.
    expect([...VOUCHER_BOOKING_STATUSES]).toEqual(["confirmed", "checked_in", "completed"]);
  });
});

describe("isVoucherReceipt", () => {
  it("só depois do check-out o documento vira comprovante", () => {
    expect(isVoucherReceipt("completed")).toBe(true);
    expect(isVoucherReceipt("confirmed")).toBe(false);
    expect(isVoucherReceipt("checked_in")).toBe(false);
  });
});
