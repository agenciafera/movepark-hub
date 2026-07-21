// Testes da lógica pura do reconcile-refunds (C-22 do roteiro do consumidor).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BATCH_LIMIT, CUTOFF_MINUTES, decideReconcileAction, refundCutoffIso } from "./logic.ts";

Deno.test("refundCutoffIso: o corte fica exatamente CUTOFF_MINUTES atrás do agora", () => {
  const now = Date.parse("2026-07-21T12:00:00.000Z");
  assertEquals(refundCutoffIso(now), "2026-07-21T11:45:00.000Z");
});

Deno.test("refundCutoffIso: estorno recente NÃO entra; estorno antigo entra", () => {
  const now = Date.parse("2026-07-21T12:00:00.000Z");
  const cutoff = refundCutoffIso(now);
  // O filtro do índice é `refunded_at < cutoff`.
  const recente = "2026-07-21T11:50:00.000Z"; // 10 min atrás, dentro da janela do webhook
  const antigo = "2026-07-21T11:40:00.000Z"; // 20 min atrás, o webhook já devia ter chegado
  assertEquals(recente < cutoff, false, "estorno de 10 min não é reavaliado (cedo demais)");
  assertEquals(antigo < cutoff, true, "estorno de 20 min é reavaliado");
});

Deno.test("decideReconcileAction: gateway 'refunded' + reserva confirmada → marca e cancela", () => {
  assertEquals(decideReconcileAction("refunded", "confirmed"), {
    markRefunded: true,
    cancelBooking: true,
  });
});

Deno.test("decideReconcileAction: 'refunded' + reserva pendente → marca e cancela", () => {
  assertEquals(decideReconcileAction("refunded", "pending"), {
    markRefunded: true,
    cancelBooking: true,
  });
});

Deno.test("decideReconcileAction: 'refunded' + reserva já iniciada → marca, NÃO cancela", () => {
  for (const st of ["checked_in", "completed", "no_show"]) {
    assertEquals(
      decideReconcileAction("refunded", st),
      { markRefunded: true, cancelBooking: false },
      `reserva ${st} só reflete no payment`,
    );
  }
});

Deno.test("decideReconcileAction: 'refunded' + reserva já cancelada → marca, NÃO cancela (idempotente)", () => {
  assertEquals(decideReconcileAction("refunded", "cancelled"), {
    markRefunded: true,
    cancelBooking: false,
  });
});

Deno.test("decideReconcileAction: gateway ainda não estornou → não mexe em nada", () => {
  for (const st of ["paid", "pending", "authorized", "failed", null, undefined]) {
    assertEquals(
      decideReconcileAction(st, "confirmed"),
      { markRefunded: false, cancelBooking: false },
      `status de gateway ${st} não dispara reconciliação`,
    );
  }
});

Deno.test("constantes de operação: corte de 15 min e teto de 100 por execução", () => {
  assertEquals(CUTOFF_MINUTES, 15);
  assertEquals(BATCH_LIMIT, 100);
});
