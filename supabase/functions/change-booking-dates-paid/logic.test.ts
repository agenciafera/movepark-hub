import { assertEquals } from "jsr:@std/assert";
// `parseBrPhone` mora em _shared/payments/contact.ts e é testada lá.
import {
  extensionDenial,
  fareUpgradeFor,
  parseChangeDatesPaidInput,
  quoteChanged,
  refundableCents,
  stripTotals,
  upgradePlan,
} from "./logic.ts";

Deno.test("parseChangeDatesPaidInput: exige código e datas válidas", () => {
  assertEquals(parseChangeDatesPaidInput({}).error, "booking_code é obrigatório.");
  assertEquals(
    parseChangeDatesPaidInput({ booking_code: "MP-1", check_in_at: "x", check_out_at: "y" }).error,
    "Datas inválidas (use ISO 8601).",
  );
});

Deno.test("parseChangeDatesPaidInput: check_out após check_in + normaliza ISO", () => {
  assertEquals(
    parseChangeDatesPaidInput({
      booking_code: "MP-1",
      check_in_at: "2027-05-12T12:00:00Z",
      check_out_at: "2027-05-10T12:00:00Z",
    }).error,
    "Check-out precisa ser após o check-in.",
  );
  const { input } = parseChangeDatesPaidInput({
    booking_code: " MP-2 ",
    check_in_at: "2027-05-20T12:00:00Z",
    check_out_at: "2027-05-24T12:00:00Z",
  });
  assertEquals(input, {
    bookingCode: "MP-2",
    checkInAt: "2027-05-20T12:00:00.000Z",
    checkOutAt: "2027-05-24T12:00:00.000Z",
    dryRun: false,
    expectedDeltaCents: null,
    waiveFareUpgrade: false,
    reason: null,
    extend: false,
  });
});

Deno.test("prévia e conferência do valor: dry_run e expected_delta_cents", () => {
  const base = { booking_code: "MP-3", check_in_at: "2027-05-20T12:00:00Z", check_out_at: "2027-05-24T12:00:00Z" };
  assertEquals(parseChangeDatesPaidInput({ ...base, dry_run: true }).input?.dryRun, true);
  assertEquals(parseChangeDatesPaidInput({ ...base, expected_delta_cents: -5780 }).input?.expectedDeltaCents, -5780);
  assertEquals(parseChangeDatesPaidInput({ ...base, expected_delta_cents: 57.8 }).error, "expected_delta_cents precisa ser inteiro (centavos).");
  // Valor mudou entre a prévia e o clique: recusa. Sem prévia (chamada antiga), não confere.
  assertEquals(quoteChanged(-5780, -5780), false);
  assertEquals(quoteChanged(-5780, 2570), true);
  assertEquals(quoteChanged(null, 8000), false);
});

Deno.test("quanto ainda dá para devolver de uma cobrança", () => {
  assertEquals(refundableCents(157.4, null), 15740);
  assertEquals(refundableCents("157.40", "57.80"), 9960);
  assertEquals(refundableCents(100, 120), 0);
});

// Regra de 26/11/2026: a equipe que altera datas de reserva Básica cobra o upgrade para o Flex junto.
const BASICA = { date_change: false, plate_change: false };
const FLEX = { date_change: true, plate_change: true };
const base = { isStaff: true, isHubAdmin: false, waive: false, benefits: BASICA, currentFareCents: 0, flexCents: 1290 };

Deno.test("fareUpgradeFor: equipe na Básica cobra o Flex (R$ 12,90)", () => {
  assertEquals(fareUpgradeFor(base), { tier: "flex", cents: 1290 });
});

Deno.test("fareUpgradeFor: plano que já inclui alterar datas não cobra nada", () => {
  assertEquals(fareUpgradeFor({ ...base, benefits: FLEX, currentFareCents: 1290 }), null);
});

Deno.test("fareUpgradeFor: o cliente nunca paga upgrade por aqui (a Edge recusa antes)", () => {
  assertEquals(fareUpgradeFor({ ...base, isStaff: false }), null);
});

Deno.test("fareUpgradeFor: só o hub_admin dispensa; o parceiro pedindo a dispensa ainda paga", () => {
  assertEquals(fareUpgradeFor({ ...base, isHubAdmin: true, waive: true }), null);
  assertEquals(fareUpgradeFor({ ...base, waive: true }), { tier: "flex", cents: 1290 });
});

Deno.test("fareUpgradeFor: sem Flex ativo no catálogo, não inventa preço", () => {
  assertEquals(fareUpgradeFor({ ...base, flexCents: null }), null);
});

Deno.test("upgradePlan: diferença positiva vai num PIX só; zero ou negativa, o upgrade vem antes", () => {
  const up = { tier: "flex" as const, cents: 1290 };
  assertEquals(upgradePlan(1890, up), { kind: "together", chargeCents: 3180 });
  assertEquals(upgradePlan(0, up), { kind: "upgrade_first", upgradeCents: 1290 });
  assertEquals(upgradePlan(-1890, up), { kind: "upgrade_first", upgradeCents: 1290 });
  assertEquals(upgradePlan(1890, null), { kind: "none" });
});

Deno.test("stripTotals: o balcão recebe a diferença, nunca o total da reserva", () => {
  const view = { current_total: 164.1, new_total: 182.9, delta: 18.8, total_amount: 182.9 };
  assertEquals(stripTotals(view, false), { delta: 18.8, current_total: null, new_total: null });
  assertEquals(stripTotals(view, true), view);
});

Deno.test("parseChangeDatesPaidInput: dispensa do upgrade exige motivo (menos na prévia)", () => {
  const datas = { booking_code: "MP-1", check_in_at: "2026-12-10T10:00:00Z", check_out_at: "2026-12-12T10:00:00Z" };
  assertEquals(parseChangeDatesPaidInput({ ...datas, waive_fare_upgrade: true }).error, "Diga o motivo de não cobrar o upgrade.");
  assertEquals(parseChangeDatesPaidInput({ ...datas, waive_fare_upgrade: true, dry_run: true }).input?.waiveFareUpgrade, true);
  const ok = parseChangeDatesPaidInput({ ...datas, waive_fare_upgrade: true, reason: "  cortesia combinada  " }).input;
  assertEquals([ok?.waiveFareUpgrade, ok?.reason], [true, "cortesia combinada"]);
  assertEquals(parseChangeDatesPaidInput(datas).input?.waiveFareUpgrade, false);
});

// Parte 2 (26/11/2026): estender a saída com o carro no pátio.
Deno.test("extensionDenial: equipe estende depois da entrada; cliente não; antes da entrada é Alterar datas", () => {
  const base = {
    isStaff: true,
    status: "completed",
    checkInAt: "2026-11-20T12:00:00Z",
    checkOutAt: "2026-11-22T12:00:00Z",
    checkedOutAt: null,
    requestedCheckInAt: "2026-11-20T12:00:00.000Z",
    requestedCheckOutAt: "2026-11-24T12:00:00Z",
    now: new Date("2026-11-23T10:00:00Z"),
  };
  assertEquals(extensionDenial(base), null);
  assertEquals(extensionDenial({ ...base, isStaff: false })?.status, 403);
  assertEquals(extensionDenial({ ...base, now: new Date("2026-11-19T10:00:00Z") })?.error, "A reserva ainda não começou. Use Alterar datas.");
});

Deno.test("extensionDenial: saída já registrada, cancelada, outra entrada, saída menor ou reserva antiga", () => {
  const base = {
    isStaff: true,
    status: "checked_in",
    checkInAt: "2026-11-20T12:00:00Z",
    checkOutAt: "2026-11-22T12:00:00Z",
    checkedOutAt: null,
    requestedCheckInAt: "2026-11-20T12:00:00Z",
    requestedCheckOutAt: "2026-11-24T12:00:00Z",
    now: new Date("2026-11-23T10:00:00Z"),
  };
  assertEquals(extensionDenial({ ...base, checkedOutAt: "2026-11-22T13:00:00Z" })?.error, "Esta reserva não está mais no pátio.");
  assertEquals(extensionDenial({ ...base, status: "cancelled" })?.error, "Esta reserva não está mais no pátio.");
  assertEquals(extensionDenial({ ...base, requestedCheckInAt: "2026-11-21T12:00:00Z" })?.error, "Na extensão, a entrada não muda.");
  assertEquals(
    extensionDenial({ ...base, requestedCheckOutAt: "2026-11-22T11:00:00Z" })?.error,
    "A nova saída precisa ser depois da saída reservada.",
  );
  assertEquals(extensionDenial({ ...base, now: new Date("2026-12-23T12:00:01Z") })?.error, "Esta reserva terminou há mais de 30 dias.");
});
