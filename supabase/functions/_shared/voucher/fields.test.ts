import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  formatBRL,
  mapBookingRowToVoucher,
  emailPhotoUrl,
  locationBrand,
  mapsSearchUrl,
  staticMapUrl,
  resolveParkingLogo,
  voucherFields,
  voucherFilename,
  type VoucherBooking,
} from "./fields.ts";

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
    "Estacionamento",
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

Deno.test("mapBookingRowToVoucher extrai a vaga do item 'parking' e relações aninhadas", () => {
  const v = mapBookingRowToVoucher({
    id: "b1",
    code: "MP-Z9",
    status: "confirmed",
    check_in_at: base.check_in_at,
    check_out_at: base.check_out_at,
    total_amount: "200.00",
    currency: "BRL",
    location: { name: "GRU", address: "Rua X", company: { name: "Aeropark" } },
    vehicle: { license_plate: "AAA-1B11", model: "Onix" },
    items: [
      { item_type: "service", parking_type: null },
      { item_type: "parking", parking_type: { name: "Coberta" } },
    ],
  });
  assertEquals(v.company_name, "Aeropark");
  assertEquals(v.location_name, "GRU");
  assertEquals(v.parking_type_name, "Coberta");
  assertEquals(v.total_amount, 200);
  assertEquals(v.vehicle?.license_plate, "AAA-1B11");
});

Deno.test("resolveParkingLogo: unidade antes da empresa; o escuro cai no colorido, que a tela pinta de branco", () => {
  assertEquals(resolveParkingLogo(null, null), { light: null, dark: null });
  assertEquals(
    resolveParkingLogo({ logo_url: "https://c/u.png" }, { logo_url: "https://c/e.png", logo_dark_url: "https://c/e-b.png" }),
    { light: "https://c/u.png", dark: "https://c/e-b.png" },
  );
  assertEquals(resolveParkingLogo(null, { logo_url: "https://c/e.png" }), { light: "https://c/e.png", dark: "https://c/e.png" });
  // O contrário não: sem colorido, o fundo claro fica sem logo (o branco some no branco).
  assertEquals(resolveParkingLogo(null, { logo_dark_url: "https://c/b.png" }), { light: null, dark: "https://c/b.png" });
});

Deno.test("mapBookingRowToVoucher: traz o logo resolvido da unidade e da empresa", () => {
  const v = mapBookingRowToVoucher({
    code: "MP-1",
    check_in_at: "2026-10-10T12:00:00Z",
    check_out_at: "2026-10-12T12:00:00Z",
    total_amount: "10",
    currency: "BRL",
    location: {
      name: "GRU",
      address: "Rua A, 1",
      logo_url: null,
      logo_dark_url: null,
      company: { name: "Pare Seguro", logo_url: "https://c/ps.png", logo_dark_url: "https://c/ps-b.png" },
    },
    vehicle: null,
    items: [],
  });
  assertEquals(v.parking_logo, { light: "https://c/ps.png", dark: "https://c/ps-b.png" });
});

Deno.test("mapsSearchUrl codifica o endereço", () => {
  assertEquals(
    mapsSearchUrl("Rua A, 1 - Guarulhos"),
    "https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%201%20-%20Guarulhos",
  );
});

Deno.test("emailPhotoUrl: foto AVIF do site vira o JPG da pasta email", () => {
  assertEquals(
    emailPhotoUrl("https://movepark.co/", "/Estacionamentos/pare-seguro/pare-seguro-2.avif"),
    "https://movepark.co/Estacionamentos/pare-seguro/email/pare-seguro-2.jpg",
  );
  assertEquals(emailPhotoUrl("https://movepark.co", "https://cdn.x/a.JPG"), "https://cdn.x/a.JPG");
  assertEquals(emailPhotoUrl("https://movepark.co", "https://cdn.x/a.webp"), null);
  assertEquals(emailPhotoUrl("https://movepark.co", "/Estacionamentos/solta.avif"), null);
  assertEquals(emailPhotoUrl("https://movepark.co", null), null);
});

Deno.test("staticMapUrl: só com chave e coordenadas, pino na cor da marca", () => {
  assertEquals(staticMapUrl(-23.46, -46.5, null), null);
  assertEquals(staticMapUrl(null, -46.5, "k"), null);
  const u = new URL(staticMapUrl(-23.4637952, -46.5015367, "k")!);
  assertEquals(u.searchParams.get("center"), "-23.463795,-46.501537");
  assertEquals(u.searchParams.get("markers"), "color:0x5D5FEF|-23.463795,-46.501537");
  assertEquals(u.searchParams.get("key"), "k");
});

Deno.test("locationBrand: nome da empresa e logo resolvido da unidade", () => {
  assertEquals(
    locationBrand({ logo_url: null, company: { name: "Pare Seguro", logo_url: "https://c/ps.png", logo_dark_url: null } }),
    { company_name: "Pare Seguro", parking_logo: { light: "https://c/ps.png", dark: "https://c/ps.png" } },
  );
  assertEquals(locationBrand(null).company_name, null);
});
