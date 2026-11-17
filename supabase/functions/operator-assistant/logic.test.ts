import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  comoExecutar,
  dentroDoLimite,
  lerConfig,
  lerCorpo,
  memoriaDe,
  novoToken,
  podeConfirmar,
  resumoDoResultado,
} from "./logic.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";
const ACAO = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

Deno.test("corpo: lista fechada, campo a mais não passa", () => {
  const { corpo } = lerCorpo({
    acao: "enviar", company_id: EMPRESA, mensagem: " oi ", pagina: "/operator/bookings/MP-ABC123",
    booking_code: "mp-abc123", requestContext: { "movepark.operator.companyId": "outra" },
  });
  assertEquals(corpo, {
    acao: "enviar", companyId: EMPRESA, mensagem: "oi", pagina: "/operator/bookings/MP-ABC123", bookingCode: "MP-ABC123",
  });
});

Deno.test("corpo: página fora do /operator e código torto viram nulo", () => {
  const { corpo } = lerCorpo({ acao: "enviar", company_id: EMPRESA, mensagem: "x", pagina: "https://evil", booking_code: "1; drop" });
  assert(corpo && corpo.acao === "enviar");
  if (corpo?.acao === "enviar") {
    assertEquals(corpo.pagina, null);
    assertEquals(corpo.bookingCode, null);
  }
});

Deno.test("corpo: recusas", () => {
  assert(lerCorpo({ acao: "apagar_tudo" }).erro);
  assert(lerCorpo({ acao: "enviar", company_id: "x", mensagem: "oi" }).erro);
  assert(lerCorpo({ acao: "enviar", company_id: EMPRESA, mensagem: "   " }).erro);
  assert(lerCorpo({ acao: "enviar", company_id: EMPRESA, mensagem: "a".repeat(2001) }).erro);
  assert(lerCorpo({ acao: "confirmar", action_id: "1" }).erro);
  assertEquals(lerCorpo({ acao: "confirmar", action_id: ACAO }).corpo, { acao: "confirmar", actionId: ACAO });
});

Deno.test("config: padrão quando vazia ou torta, e enabled:false explícito desliga", () => {
  assertEquals(lerConfig(null).enabled, true);
  assertEquals(lerConfig("{torto").max_messages_per_user_hour, 40);
  assertEquals(lerConfig('{"enabled": false}').enabled, false);
  assertEquals(lerConfig('{"max_messages_per_user_hour": 5}').max_messages_per_user_hour, 5);
  assertEquals(lerConfig('{"max_messages_per_user_hour": -1}').max_messages_per_user_hour, 40);
});

Deno.test("teto de uso por usuário e por empresa", () => {
  const c = lerConfig('{"max_messages_per_user_hour": 3, "max_messages_per_company_day": 10}');
  assertEquals(dentroDoLimite(c, 2, 9), null);
  assertStringIncludes(dentroDoLimite(c, 3, 0) ?? "", "hora");
  assertStringIncludes(dentroDoLimite(c, 0, 10) ?? "", "hoje");
});

Deno.test("memória por usuário e empresa, com o prefixo do tenant", () => {
  const m = memoriaDe("u1", EMPRESA, "c1");
  assertEquals(m.resource, "movepark-operador:hub:u1");
  assertEquals(m.thread, `movepark-operador:hub:u1:${EMPRESA}:c1`);
});

Deno.test("token mpo_ nunca começa com mp_ (não pode ser lido como chave de API)", () => {
  const t = novoToken(new Uint8Array(24).fill(171));
  assert(t.startsWith("mpo_"));
  assert(!t.startsWith("mp_"));
  assertEquals(t.length, 4 + 48);
});

Deno.test("só confirma a proposta própria, viva e não vencida", () => {
  const agora = new Date("2026-11-17T12:00:00Z");
  const base = {
    id: ACAO, profile_id: "u1", company_id: EMPRESA, kind: "cancel", status: "proposed",
    expires_at: "2026-11-17T12:05:00Z", params: {},
  };
  assertEquals(podeConfirmar(base, "u1", agora), null);
  assert(podeConfirmar(null, "u1", agora));
  assertStringIncludes(podeConfirmar(base, "u2", agora) ?? "", "outra pessoa");
  assertStringIncludes(podeConfirmar({ ...base, status: "executed" }, "u1", agora) ?? "", "já foi feita");
  assertStringIncludes(podeConfirmar({ ...base, status: "executing" }, "u1", agora) ?? "", "sendo feita");
  assertStringIncludes(podeConfirmar({ ...base, status: "expired" }, "u1", agora) ?? "", "não vale");
  assertStringIncludes(podeConfirmar(base, "u1", new Date("2026-11-17T12:06:00Z")) ?? "", "venceu");
});

Deno.test("cada ação vai pelo mesmo caminho do botão do painel", () => {
  const p = { booking_code: "MP-ABC123", reason: "motivo", check_in_at: "a", check_out_at: "b", license_plate: "ABC1D23" };
  assertEquals(comoExecutar("cancel", p, "confirmed"), { tipo: "edge", funcao: "cancel-booking", corpo: { booking_code: "MP-ABC123", reason: "motivo" } });
  assertEquals((comoExecutar("change_dates", p, "pending") as { funcao: string }).funcao, "change-booking-dates");
  assertEquals((comoExecutar("change_dates", p, "confirmed") as { funcao: string }).funcao, "change-booking-dates-paid");
  assertEquals((comoExecutar("change_vehicle", p, "confirmed") as { funcao: string }).funcao, "change-booking-vehicle");
  assertEquals(comoExecutar("check_in", p, "confirmed"), { tipo: "status", status: "checked_in", campo: "checked_in_at" });
  assertEquals(comoExecutar("check_out", p, "checked_in"), { tipo: "status", status: "completed", campo: "checked_out_at" });
  assertEquals(comoExecutar("refund", p, "confirmed"), null);
  assertEquals(comoExecutar("cancel", {}, "confirmed"), null);
});

Deno.test("resumo do resultado em português, com o dinheiro", () => {
  assertStringIncludes(resumoDoResultado("cancel", { refunded: true }), "estorno enviado");
  assertStringIncludes(resumoDoResultado("cancel", { refund_manual: true }), "2 dias úteis");
  assertStringIncludes(resumoDoResultado("change_dates", { mode: "charge", delta: 30.5 }), "R$ 30,50");
  assertStringIncludes(resumoDoResultado("change_dates", { mode: "applied", refunded: true }), "estornada");
});

Deno.test("troca de datas paga leva a diferença que o operador confirmou; pendente não", () => {
  const p = { booking_code: "MP-ABC123", check_in_at: "a", check_out_at: "b", expected_delta_cents: -5780 };
  const paga = comoExecutar("change_dates", p, "confirmed") as { corpo: Record<string, unknown> };
  assertEquals(paga.corpo.expected_delta_cents, -5780);
  const pendente = comoExecutar("change_dates", p, "pending") as { corpo: Record<string, unknown> };
  assertEquals("expected_delta_cents" in pendente.corpo, false);
});

Deno.test("devolução da troca de datas que foi para a fila manual", () => {
  assertStringIncludes(resumoDoResultado("change_dates", { mode: "applied", refund_manual: true, delta: -57.8 }), "R$ 57,80");
  assertStringIncludes(resumoDoResultado("change_dates", { mode: "applied", refund_manual: true, delta: -57.8 }), "2 dias úteis");
});
