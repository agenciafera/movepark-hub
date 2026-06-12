import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { voucherFields, voucherFilename, formatBRL, type VoucherBooking } from "./fields.ts";

const base: VoucherBooking = {
  code: "MP-A8K7P2",
  check_in_at: "2026-10-10T12:00:00Z",
  check_out_at: "2026-10-12T12:00:00Z",
  total_amount: 159.5,
  currency: "BRL",
  company_name: "Aerovalet",
  location_name: "Aeroporto de Guarulhos",
  location_address: "Av. Novo Brasil, 954",
  parking_type_name: "Vaga coberta",
  vehicle: { license_plate: "ABC-1D23", model: "Civic" },
};

Deno.test("voucherFilename usa o código", () => {
  assertEquals(voucherFilename("MP-A8K7P2"), "voucher-MP-A8K7P2.pdf");
});

Deno.test("formatBRL formata em reais", () => {
  assertStringIncludes(formatBRL(159.5), "159,50");
});

Deno.test("voucherFields traz as linhas na ordem com veículo e endereço", () => {
  const labels = voucherFields(base).map((l) => l.label);
  assertEquals(labels, [
    "Operadora",
    "Unidade",
    "Endereço",
    "Tipo de vaga",
    "Check-in",
    "Check-out",
    "Veículo",
    "Valor",
  ]);
});

Deno.test("omite endereço e veículo quando ausentes; fallback de tipo", () => {
  const lines = voucherFields({
    ...base,
    location_address: null,
    vehicle: null,
    parking_type_name: null,
  });
  const labels = lines.map((l) => l.label);
  assertEquals(labels.includes("Endereço"), false);
  assertEquals(labels.includes("Veículo"), false);
  assertEquals(lines.find((l) => l.label === "Tipo de vaga")?.value, "Vaga");
});

Deno.test("veículo sem modelo mostra só a placa", () => {
  const lines = voucherFields({ ...base, vehicle: { license_plate: "XYZ-7K89", model: null } });
  assertEquals(lines.find((l) => l.label === "Veículo")?.value, "XYZ-7K89");
});
