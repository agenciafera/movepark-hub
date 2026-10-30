import { describe, expect, it } from "vitest";
import {
  canDownloadVoucher,
  isVoucherReceipt,
  VOUCHER_BOOKING_STATUSES,
  voucherQrContent,
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

/**
 * docs/specs/integracoes.md § 5.6: com a cancela integrada (Cloudpark), o QR é o código cru do
 * provedor, igual ao PDF do servidor (`supabase/functions/_shared/voucher/pdf.ts`).
 */
describe("voucherQrContent", () => {
  it("usa o código da cancela quando a reserva tem um", () => {
    expect(voucherQrContent("https://movepark.co", "MP-1", " 5d864b66-ff5f-4f98-ad6f-323c7 ")).toBe(
      "5d864b66-ff5f-4f98-ad6f-323c7",
    );
  });

  it("sem código, segue a página de validação do Hub", () => {
    expect(voucherQrContent("https://movepark.co", "MP-1", null)).toBe("https://movepark.co/voucher/validate?code=MP-1");
    expect(voucherQrContent("https://movepark.co", "MP 1", "  ")).toBe("https://movepark.co/voucher/validate?code=MP%201");
  });
});
