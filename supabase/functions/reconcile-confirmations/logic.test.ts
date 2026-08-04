import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  autorizado,
  confirmationCutoffIso,
  CUTOFF_MINUTES,
  decidirAcao,
} from "./logic.ts";

Deno.test("chave do Vault ausente recusa, mesmo com header", () => {
  // A chave esperada vem por RPC do Vault, então ela PODE voltar nula. Sem chave
  // conhecida não há como distinguir o cron de qualquer um.
  assertEquals(autorizado(null, "qualquer"), false);
  assertEquals(autorizado(undefined, "qualquer"), false);
  assertEquals(autorizado("", "qualquer"), false);
});

Deno.test("chave errada recusa, chave exata entra", () => {
  assertEquals(autorizado("segredo", null), false);
  assertEquals(autorizado("segredo", "segred"), false);
  assertEquals(autorizado("segredo", "segredo"), true);
});

Deno.test("a janela recua exatamente os minutos declarados", () => {
  const agora = Date.parse("2026-08-04T12:00:00.000Z");
  assertEquals(confirmationCutoffIso(agora), "2026-08-04T11:50:00.000Z");
  assertEquals(CUTOFF_MINUTES, 10);
});

Deno.test("desfecho de confirmação vira confirmar", () => {
  assertEquals(decidirAcao("confirmed", null, null).tipo, "confirmar");
  assertEquals(decidirAcao("reconfirmed", null, null).tipo, "confirmar");
});

Deno.test("needs_refund estorna, preferindo o charge id que a RPC devolveu", () => {
  // A RPC olhou a linha agora; o campo do pagamento pode estar velho.
  const a = decidirAcao("needs_refund", "ch_da_rpc", "ch_do_pagamento");
  assertEquals(a, { tipo: "estornar", chargeId: "ch_da_rpc" });
});

Deno.test("sem charge id na RPC, cai no do pagamento", () => {
  const a = decidirAcao("needs_refund", null, "ch_do_pagamento");
  assertEquals(a, { tipo: "estornar", chargeId: "ch_do_pagamento" });
});

Deno.test("needs_refund SEM charge id nenhum não chama o gateway", () => {
  // Chamar refundCharge com undefined deixaria o gateway decidir o que estornar.
  assertEquals(decidirAcao("needs_refund", null, null).tipo, "nada");
  assertEquals(decidirAcao("needs_refund", undefined, undefined).tipo, "nada");
});

Deno.test("desfecho desconhecido NÃO estorna", () => {
  // Estorno é irreversível do lado do parceiro, então o default tem que ser não fazer
  // nada. Um desfecho novo na RPC não pode virar estorno por omissão.
  for (const o of [null, undefined, "", "already_confirmed", "needs_review", "NEEDS_REFUND"]) {
    assertEquals(decidirAcao(o, "ch_1", "ch_2").tipo, "nada", `"${o}" não pode estornar`);
  }
});
