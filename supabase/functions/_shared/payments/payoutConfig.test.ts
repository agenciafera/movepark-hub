import { assertEquals } from "jsr:@std/assert";
import {
  isValidInterval,
  isValidTransferDay,
  normalizeTransferDay,
  resolveAnticipation,
  resolveTransfer,
  type RecipientConfigRow,
} from "./payoutConfig.ts";

const emptyRow: RecipientConfigRow = {
  transfer_enabled: null,
  transfer_interval: null,
  transfer_day: null,
  anticipation_enabled: null,
  anticipation_type: null,
  anticipation_volume_percentage: null,
  anticipation_delay: null,
  anticipation_days: null,
};

Deno.test("resolveTransfer: herda o global quando a empresa não tem config", () => {
  const g = { payout_transfer_enabled: "true", payout_transfer_interval: "daily", payout_transfer_day: "0" };
  assertEquals(resolveTransfer(emptyRow, g), { enabled: true, interval: "Daily", day: 0 });
});

// Config vigente: o recebedor do parceiro nasce com transferência automática DESLIGADA (o saldo
// fica na Pagar.me até o saque). O global manda; só uma coluna preenchida na empresa reativa.
Deno.test("resolveTransfer: global desligado → recebedor novo nasce sem transferência automática", () => {
  const g = { payout_transfer_enabled: "false", payout_transfer_interval: "Monthly", payout_transfer_day: "1" };
  assertEquals(resolveTransfer(emptyRow, g), { enabled: false, interval: "Monthly", day: 1 });
  assertEquals(resolveTransfer(null, g), { enabled: false, interval: "Monthly", day: 1 });
  // Override explícito da empresa continua ganhando do global.
  assertEquals(resolveTransfer({ ...emptyRow, transfer_enabled: true }, g).enabled, true);
});

Deno.test("resolveTransfer: config da empresa sobrepõe o global", () => {
  const g = { payout_transfer_interval: "daily", payout_transfer_day: "0" };
  const row = { ...emptyRow, transfer_interval: "Weekly", transfer_day: 3, transfer_enabled: true };
  assertEquals(resolveTransfer(row, g), { enabled: true, interval: "Weekly", day: 3 });
});

Deno.test("resolveTransfer: sem global nem empresa → transferência DESLIGADA", () => {
  // Se a linha do app_setting sumir, o recebedor não pode voltar a repassar sozinho: o dinheiro
  // fica no saldo até um saque explícito.
  assertEquals(resolveTransfer(null, {}), { enabled: false, interval: "Daily", day: 0 });
});

Deno.test("resolveTransfer: o global ainda manda ligar quando quiser", () => {
  assertEquals(resolveTransfer(null, { payout_transfer_enabled: "true" }), {
    enabled: true,
    interval: "Daily",
    day: 0,
  });
});

Deno.test("normalizeTransferDay: força a faixa por intervalo", () => {
  assertEquals(normalizeTransferDay("Daily", 9), 0);
  assertEquals(normalizeTransferDay("Weekly", 9), 5);
  assertEquals(normalizeTransferDay("Monthly", 99), 31);
  assertEquals(normalizeTransferDay("Weekly", 0), 1);
});

Deno.test("isValidTransferDay/isValidInterval", () => {
  assertEquals(isValidInterval("Weekly"), true);
  assertEquals(isValidInterval("weekly"), false);
  assertEquals(isValidTransferDay("Daily", 0), true);
  assertEquals(isValidTransferDay("Daily", 3), false);
  assertEquals(isValidTransferDay("Weekly", 5), true);
  assertEquals(isValidTransferDay("Weekly", 6), false);
  assertEquals(isValidTransferDay("Monthly", 31), true);
  assertEquals(isValidTransferDay("Monthly", 32), false);
});

Deno.test("resolveAnticipation: herda global; empresa sobrepõe; clampa volume", () => {
  assertEquals(resolveAnticipation(emptyRow, { payout_anticipation_enabled: "false" }).enabled, false);
  const row = { ...emptyRow, anticipation_enabled: true, anticipation_type: "1025", anticipation_volume_percentage: 150 };
  const r = resolveAnticipation(row, {});
  assertEquals(r.enabled, true);
  assertEquals(r.type, "1025");
  assertEquals(r.volumePercentage, 100); // clampado
});
