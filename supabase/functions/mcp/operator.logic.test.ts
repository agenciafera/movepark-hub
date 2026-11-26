import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { analisarReserva, escoposEfetivos, montarProposta, normalizarPlaca, type Situacao } from "./operator.logic.ts";
import { OPERATOR_TOOLS, PARTNER_TOOLS } from "./tools.ts";

/**
 * O assistente do operador diz o que dá para fazer numa reserva e monta a proposta da ação.
 *
 * O que estes testes seguram: a IA nunca promete o que o botão do painel recusa. As regras vêm
 * das Edges (refundDecision, vehicleChangeOpen...), então o que se mede aqui é a costura: status ×
 * tarifa × pagamento × data, e o escopo por ação.
 */

const AGORA = new Date("2026-11-17T12:00:00Z");
const BENEF_BASICA = { date_change: false, plate_change: false, flight_delay_protection: false };
const BENEF_FLEX = { date_change: true, plate_change: true, notifications_sms: true, flight_delay_protection: false };
const BENEF_SUPERFLEX = { ...BENEF_FLEX, flight_delay_protection: true };

const FARES = [
  { tier: "basica" as const, label: "Básica", price_cents: 0, cancel_window_minutes: 1440, benefits: BENEF_BASICA },
  { tier: "flex" as const, label: "Flex", price_cents: 1290, cancel_window_minutes: 1440, benefits: BENEF_FLEX },
  { tier: "superflex" as const, label: "Superflex", price_cents: 2490, cancel_window_minutes: 1, benefits: BENEF_SUPERFLEX },
];

function reserva(over: Partial<Situacao> = {}): Situacao {
  return {
    id: "b-1",
    code: "MP-ABC123",
    status: "confirmed",
    origin: "hub_direct",
    check_in_at: "2026-11-20T13:00:00Z",
    check_out_at: "2026-11-25T13:00:00Z",
    checked_in_at: null,
    checked_out_at: null,
    total_amount: 200,
    customer_name: "Ana",
    fare_tier: "basica",
    fare_price_cents: 0,
    fare_cancel_until: "2026-11-19T13:00:00Z",
    fare_benefits: BENEF_BASICA,
    location: { id: "l-1", name: "Unidade", tolerance_minutes: 60, checkout_mode: "hub" },
    parking_type: "Coberta",
    vehicle: { plate: "ABC1D23", model: "Gol", color: "Preto" },
    payments: [
      {
        id: "p-1", kind: "booking", method: "pix", status: "paid", amount: 200, installments: null,
        paid_at: "2026-11-10T10:00:00Z", refunded_amount: null, refunded_at: null, created_at: "2026-11-10T10:00:00Z",
      },
    ],
    flight_extensions: [],
    fares: FARES,
    ...over,
  };
}

const TODOS = ["bookings:read", "bookings:cancel", "bookings:write", "bookings:checkin", "operator:assist"];

Deno.test("Básica confirmada dentro da janela: cliente cancela com estorno, mas não troca datas sozinho", () => {
  const a = analisarReserva(reserva(), AGORA);
  assertEquals(a.janela_de_cancelamento.cliente_ainda_cancela_com_estorno, true);
  assertStringIncludes(a.pode_agora.cancelar.pelo_cliente, "com estorno");
  assertEquals(a.pode_agora.cancelar.estorno, "R$ 200,00");
  assertEquals(a.pode_agora.alterar_datas.pelo_cliente, false);
  assertEquals(a.pode_agora.alterar_datas.pela_equipe, true);
  assertStringIncludes(a.pode_agora.alterar_datas.motivo ?? "", "tarifa");
  // Upgrade para Flex e Superflex, com a diferença e o que libera.
  assertEquals(a.pode_agora.upgrade.opcoes.map((o) => [o.tarifa, o.diferenca]), [["Flex", "R$ 12,90"], ["Superflex", "R$ 24,90"]]);
  assert(a.pode_agora.upgrade.opcoes[0].libera.includes("alterar datas"));
});

Deno.test("fora da janela: o cliente é bloqueado, a equipe ainda cancela com estorno", () => {
  const a = analisarReserva(reserva(), new Date("2026-11-19T20:00:00Z"));
  assertEquals(a.janela_de_cancelamento.cliente_ainda_cancela_com_estorno, false);
  assertStringIncludes(a.pode_agora.cancelar.pelo_cliente, "janela");
  assertStringIncludes(a.pode_agora.cancelar.pela_equipe, "com estorno");
});

Deno.test("Flex confirmada: o próprio cliente troca datas e placa", () => {
  const a = analisarReserva(reserva({ fare_tier: "flex", fare_price_cents: 1290, fare_benefits: BENEF_FLEX }), AGORA);
  assertEquals(a.pode_agora.alterar_datas.pelo_cliente, true);
  assertEquals(a.pode_agora.trocar_veiculo.pelo_cliente, true);
  assertEquals(a.pode_agora.upgrade.opcoes.map((o) => o.diferenca), ["R$ 12,00"]);
});

Deno.test("depois da data de entrada ninguém troca datas: o sistema não devolve diárias não usadas", () => {
  const a = analisarReserva(reserva({ fare_benefits: BENEF_FLEX, fare_tier: "flex" }), new Date("2026-11-21T10:00:00Z"));
  assertEquals(a.pode_agora.alterar_datas.pela_equipe, false);
  assertEquals(a.pode_agora.alterar_datas.pelo_cliente, false);
  assertStringIncludes(a.pode_agora.alterar_datas.motivo ?? "", "diárias não usadas");
  assertEquals(a.pode_agora.upgrade.possivel, false);
});

Deno.test("veículo já entrou: nem a equipe cancela, e o check-out fica disponível", () => {
  const a = analisarReserva(reserva({ status: "checked_in", checked_in_at: "2026-11-20T13:05:00Z" }), new Date("2026-11-21T10:00:00Z"));
  assert(a.pode_agora.cancelar.pela_equipe.startsWith("não"));
  assertEquals(a.pode_agora.check_out, true);
  assertEquals(a.pode_agora.check_in, false);
});

Deno.test("proteção de voo acionada: check-out vai pela tela, e a proposta recusa", () => {
  const s = reserva({
    status: "checked_in",
    checked_in_at: "2026-11-20T13:05:00Z",
    flight_extensions: [{ kind: "delay", actual_check_out_at: null, new_check_out_at: "2026-11-26T13:00:00Z" }],
  });
  const a = analisarReserva(s, AGORA);
  assertEquals(a.pode_agora.check_out, false);
  assert(a.avisos.some((x) => x.includes("Proteção de voo")));
  const p = montarProposta({ kind: "check_out", s, now: AGORA, scopes: TODOS, params: {} });
  assertEquals(p.ok, false);
});

Deno.test("pendente: cancelar não estorna e trocar datas só reprecifica", () => {
  const s = reserva({ status: "pending", payments: [] });
  const a = analisarReserva(s, AGORA);
  assertStringIncludes(a.pode_agora.cancelar.pela_equipe, "sem estorno");
  assertEquals(a.pode_agora.cancelar.estorno, null);
  assertStringIncludes(a.pode_agora.alterar_datas.como ?? "", "sem cobrar");
});

Deno.test("proposta de cancelamento fora da janela traz o estorno e marca a exceção", () => {
  const p = montarProposta({
    kind: "cancel", s: reserva(), now: new Date("2026-11-19T20:00:00Z"), scopes: TODOS,
    params: { reason: "Cliente vai de carro próprio" },
  });
  assert(p.ok);
  if (!p.ok) return;
  assertEquals(p.effect_cents, -20000);
  assertStringIncludes(p.summary, "estornar R$ 200,00");
  assertStringIncludes(p.summary, "exceção");
  assertStringIncludes(p.summary, "Cliente vai de carro próprio");
});

Deno.test("o motivo entra sem ponto duplicado", () => {
  const p = montarProposta({ kind: "cancel", s: reserva({ status: "pending", payments: [] }), now: AGORA, scopes: TODOS, params: { reason: "Desistiu da viagem." } });
  assert(p.ok);
  if (p.ok) assertEquals(p.summary.endsWith("Motivo: Desistiu da viagem."), true);
});

Deno.test("proposta de cancelamento sem motivo é recusada", () => {
  const p = montarProposta({ kind: "cancel", s: reserva(), now: AGORA, scopes: TODOS, params: {} });
  assertEquals(p.ok, false);
});

const flex = () => reserva({ fare_tier: "flex", fare_price_cents: 1290, fare_benefits: BENEF_FLEX });

Deno.test("volta antes: troca de datas paga com diferença negativa vira estorno parcial", () => {
  const p = montarProposta({
    kind: "change_dates", s: flex(), now: AGORA, scopes: TODOS,
    params: { check_in_at: "2026-11-20T10:00:00-03:00", check_out_at: "2026-11-23T10:00:00-03:00" },
    cotacao: { available: true, reason: null, delta_cents: -8000, new_total_cents: 12000, days: 3 },
  });
  assert(p.ok);
  if (!p.ok) return;
  assertEquals(p.effect_cents, -8000);
  assertStringIncludes(p.summary, "estornar R$ 80,00");
});

Deno.test("troca de datas mais cara gera PIX e avisa que só muda quando pagar", () => {
  const p = montarProposta({
    kind: "change_dates", s: flex(), now: AGORA, scopes: TODOS,
    params: { check_in_at: "2026-11-20T10:00:00-03:00", check_out_at: "2026-11-27T10:00:00-03:00" },
    cotacao: { available: true, reason: null, delta_cents: 5000, new_total_cents: 25000, days: 7 },
  });
  assert(p.ok);
  if (!p.ok) return;
  assertEquals(p.effect_cents, 5000);
  assertStringIncludes(p.summary, "PIX de R$ 50,00");
});

Deno.test("troca de datas sem vaga ou sem cotação não vira proposta", () => {
  const base = {
    kind: "change_dates", s: reserva(), now: AGORA, scopes: TODOS,
    params: { check_in_at: "2026-11-20T10:00:00-03:00", check_out_at: "2026-11-27T10:00:00-03:00" },
  };
  assertEquals(montarProposta(base).ok, false);
  assertEquals(
    montarProposta({ ...base, cotacao: { available: false, reason: "Sem disponibilidade", delta_cents: 0, new_total_cents: 0, days: 7 } }).ok,
    false,
  );
});

Deno.test("escopo por ação: sem bookings:cancel não cancela, sem bookings:write não troca datas", () => {
  const leitura = ["bookings:read", "operator:assist"];
  assertEquals(montarProposta({ kind: "cancel", s: reserva(), now: AGORA, scopes: leitura, params: { reason: "x" } }).ok, false);
  const operacao = ["bookings:read", "bookings:checkin", "operator:assist"];
  assertEquals(
    montarProposta({
      kind: "change_dates", s: reserva(), now: AGORA, scopes: operacao,
      params: { check_in_at: "2026-11-20T10:00:00-03:00", check_out_at: "2026-11-23T10:00:00-03:00" },
      cotacao: { available: true, reason: null, delta_cents: -1, new_total_cents: 1, days: 1 },
    }).ok,
    false,
  );
  assertEquals(montarProposta({ kind: "check_in", s: reserva(), now: AGORA, scopes: operacao, params: {} }).ok, true);
});

Deno.test("troca de veículo exige placa válida e motivo", () => {
  const s = reserva();
  assertEquals(montarProposta({ kind: "change_vehicle", s, now: AGORA, scopes: TODOS, params: { license_plate: "XX", reason: "a" } }).ok, false);
  assertEquals(montarProposta({ kind: "change_vehicle", s, now: AGORA, scopes: TODOS, params: { license_plate: "abc-1d23" } }).ok, false);
  const p = montarProposta({ kind: "change_vehicle", s, now: AGORA, scopes: TODOS, params: { license_plate: "abc-1d23", reason: "Carro do vizinho" } });
  assert(p.ok);
  if (p.ok) assertEquals(p.params.license_plate, "ABC1D23");
  assertEquals(normalizarPlaca("abc1234"), "ABC1234");
});

Deno.test("ação desconhecida é recusada com a lista das válidas", () => {
  const p = montarProposta({ kind: "refund", s: reserva(), now: AGORA, scopes: TODOS, params: {} });
  assertEquals(p.ok, false);
});

Deno.test("escopo efetivo: papel mais o operator:assist da chave, e nada mais da chave", () => {
  assertEquals(escoposEfetivos(["bookings:read"], ["operator:assist", "blog:write"]), ["bookings:read", "operator:assist"]);
  assertEquals(escoposEfetivos(["bookings:read"], []), ["bookings:read"]);
});

Deno.test("a superfície /operator não expõe escrita de parceiro", () => {
  const escritasDeParceiro = PARTNER_TOOLS.filter((t) => /:write|:cancel|:checkin/.test(t.scope ?? "")).map((t) => t.name);
  const nomes = OPERATOR_TOOLS.map((t) => t.name);
  for (const w of escritasDeParceiro) assertEquals(nomes.includes(w), false, w);
  assert(nomes.includes("propose_booking_action"));
});

// Regra de 26/11/2026: a equipe alterando datas de reserva Básica cobra o upgrade para o Flex junto.
Deno.test("Básica mais cara: o PIX da proposta leva as diárias e o upgrade para o Flex", () => {
  const p = montarProposta({
    kind: "change_dates", s: reserva(), now: AGORA, scopes: TODOS,
    params: { check_in_at: "2026-11-20T10:00:00-03:00", check_out_at: "2026-11-27T10:00:00-03:00" },
    cotacao: { available: true, reason: null, delta_cents: 5000, new_total_cents: 25000, days: 7 },
  });
  assert(p.ok);
  if (!p.ok) return;
  assertEquals(p.effect_cents, 6290);
  assertStringIncludes(p.summary, "PIX de R$ 62,90");
  assertStringIncludes(p.summary, "R$ 12,90 do upgrade para o Flex");
  // A diferença conferida na Edge continua a das diárias.
  assertEquals(p.params.expected_delta_cents, 5000);
});

Deno.test("Básica sem diferença a cobrar: a Mia manda para a tela, que faz o upgrade antes", () => {
  const p = montarProposta({
    kind: "change_dates", s: reserva(), now: AGORA, scopes: TODOS,
    params: { check_in_at: "2026-11-20T10:00:00-03:00", check_out_at: "2026-11-23T10:00:00-03:00" },
    cotacao: { available: true, reason: null, delta_cents: -8000, new_total_cents: 12000, days: 3 },
  });
  assertEquals(p.ok, false);
  if (p.ok) return;
  assertStringIncludes(p.erro, "upgrade para o Flex (R$ 12,90)");
  assertStringIncludes(p.erro, "botão Alterar datas");
});

Deno.test("depois da entrada, a Mia manda estender a saída pela tela (Cobrar pelo Hub)", () => {
  const a = analisarReserva(reserva({ check_in_at: "2026-11-15T13:00:00Z", check_out_at: "2026-11-16T13:00:00Z", status: "completed" }), AGORA);
  assert(a.avisos.some((t) => t.includes("Cobrar pelo Hub")));
  const antes = analisarReserva(reserva(), AGORA);
  assert(!antes.avisos.some((t) => t.includes("Cobrar pelo Hub")));
});
