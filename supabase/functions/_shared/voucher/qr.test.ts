import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { voucherQrContent } from "./pdf.ts";

// docs/specs/integracoes.md § 5.6: com integração de cancela, o QR é o código cru do provedor.
Deno.test("voucherQrContent: código da cancela quando existe, senão a validação do Hub", () => {
  assertEquals(voucherQrContent("https://movepark.co", "MP-1", " 5d864b66-ff5f-4f98-ad6f-323c7 "), "5d864b66-ff5f-4f98-ad6f-323c7");
  assertEquals(voucherQrContent("https://movepark.co", "MP-1", null), "https://movepark.co/voucher/validate?code=MP-1");
  assertEquals(voucherQrContent("https://movepark.co", "MP-1", "  "), "https://movepark.co/voucher/validate?code=MP-1");
});
