import { assertEquals } from "jsr:@std/assert";
import { parseUpdatePayoutInput, toRecipientColumns } from "./logic.ts";

Deno.test("exige company_id e algo pra atualizar", () => {
  assertEquals(parseUpdatePayoutInput({}).error, "company_id é obrigatório.");
  assertEquals(parseUpdatePayoutInput({ company_id: "c1" }).error, "Nada para atualizar.");
});

Deno.test("transfer: valida recorrência e dia por intervalo", () => {
  assertEquals(
    parseUpdatePayoutInput({ company_id: "c1", transfer: { interval: "weekly", day: 3 } }).error,
    "Recorrência inválida (Daily/Weekly/Monthly).",
  );
  assertEquals(
    parseUpdatePayoutInput({ company_id: "c1", transfer: { interval: "Weekly", day: 9 } }).error,
    "Dia inválido para a recorrência escolhida.",
  );
  const ok = parseUpdatePayoutInput({ company_id: "c1", transfer: { interval: "Weekly", day: 3, enabled: true } });
  assertEquals(ok.input?.transfer, { enabled: true, interval: "Weekly", day: 3 });
});

Deno.test("anticipation: tipo válido só quando habilitada; clampa volume; filtra dias", () => {
  assertEquals(
    parseUpdatePayoutInput({ company_id: "c1", anticipation: { enabled: true, type: "xpto" } }).error,
    "Tipo de antecipação inválido (full/1025).",
  );
  const ok = parseUpdatePayoutInput({
    company_id: "c1",
    anticipation: { enabled: true, type: "1025", volume_percentage: 150, days: [5, 40, 25] },
  });
  assertEquals(ok.input?.anticipation, {
    enabled: true,
    type: "1025",
    volumePercentage: 100,
    delay: null,
    days: [5, 25],
  });
});

Deno.test("toRecipientColumns: só as colunas do que veio", () => {
  const { input } = parseUpdatePayoutInput({ company_id: "c1", transfer: { interval: "Daily", day: 0 } });
  assertEquals(toRecipientColumns(input!), {
    transfer_enabled: true,
    transfer_interval: "Daily",
    transfer_day: 0,
  });
});
