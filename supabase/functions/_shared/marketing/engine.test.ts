import { assertEquals } from "jsr:@std/assert";
import {
  advancesAfterDelivery,
  type Canvas,
  decideSend,
  MAX_DELIVERY_ATTEMPTS,
  nextStep,
  escapeHtml,
  evaluateCondition,
  nextNodeId,
  renderMergeTags,
  startNodeId,
  waitUntil,
} from "./engine.ts";

const canvas: Canvas = {
  nodes: [
    { id: "t1", type: "trigger" },
    { id: "c1", type: "condition", data: { field: "bookings_count", op: "gte", value: 2 } },
    { id: "e1", type: "email", data: { subject: "Oi {{nome}}", body: "corpo" } },
    { id: "e2", type: "email", data: { subject: "Outro", body: "corpo" } },
    { id: "w1", type: "wait", data: { hours: 48 } },
    { id: "x1", type: "exit" },
  ],
  edges: [
    { from: "t1", to: "c1" },
    { from: "c1", to: "e1", branch: "yes" },
    { from: "c1", to: "e2", branch: "no" },
    { from: "e1", to: "w1" },
    { from: "w1", to: "x1" },
  ],
};

Deno.test("startNodeId acha o gatilho", () => {
  assertEquals(startNodeId(canvas), "t1");
});

Deno.test("startNodeId cai no nó sem entrada quando não há gatilho", () => {
  const semGatilho: Canvas = {
    nodes: [
      { id: "a", type: "email" },
      { id: "b", type: "exit" },
    ],
    edges: [{ from: "a", to: "b" }],
  };
  assertEquals(startNodeId(semGatilho), "a");
});

Deno.test("nextNodeId segue o ramo certo da condição", () => {
  assertEquals(nextNodeId(canvas, "c1", "yes"), "e1");
  assertEquals(nextNodeId(canvas, "c1", "no"), "e2");
});

Deno.test("nextNodeId termina o fluxo quando o ramo pedido não existe", () => {
  // Regressão: uma condição só com a saída "yes" não pode empurrar quem deu "não" para o e-mail
  // do "sim". Antes, o fallback para a primeira aresta fazia exatamente isso.
  const soSim: Canvas = {
    nodes: [
      { id: "c", type: "condition" },
      { id: "e", type: "email" },
    ],
    edges: [{ from: "c", to: "e", branch: "yes" }],
  };
  assertEquals(nextNodeId(soSim, "c", "no"), null);
});

Deno.test("nextNodeId devolve null no fim do fluxo", () => {
  assertEquals(nextNodeId(canvas, "x1"), null);
});

Deno.test("renderMergeTags troca nome, ticket e reservas", () => {
  const doc = {
    display_name: "Maria Silva Souza",
    bookings_count: 3,
    avg_ticket: 87.5,
    total_spent: 262.5,
  };
  assertEquals(renderMergeTags("Oi {{nome}}!", doc), "Oi Maria!");
  assertEquals(renderMergeTags("{{nome_completo}}", doc), "Maria Silva Souza");
  assertEquals(renderMergeTags("{{reservas}} reservas", doc), "3 reservas");
  assertEquals(renderMergeTags("média {{ticket_medio}}", doc).includes("87,50"), true);
});

Deno.test("renderMergeTags não deixa marcação crua nem 'undefined' na copy", () => {
  const saida = renderMergeTags("Oi {{nome}}, {{campo_que_nao_existe}}fim", {});
  assertEquals(saida, "Oi , fim");
  assertEquals(saida.includes("{{"), false);
  assertEquals(saida.includes("undefined"), false);
});

Deno.test("renderMergeTags escapa HTML quando pedido", () => {
  const doc = { display_name: '<script>alert("x")</script>' };
  const saida = renderMergeTags("Oi {{nome}}", doc, { escape: true });
  assertEquals(saida.includes("<script>"), false);
  assertEquals(saida.includes("&lt;script&gt;"), true);
});

Deno.test("escapeHtml cobre os cinco caracteres", () => {
  assertEquals(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});

Deno.test("decideSend: supressão vence tudo, inclusive consentimento", () => {
  const d = decideSend({
    channel: "email",
    address: "a@b.com",
    consent: true,
    suppressed: true,
    dispatchEnabled: true,
    capRemaining: 10,
  });
  assertEquals(d.status, "suppressed");
});

Deno.test("decideSend: sem opt-in de WhatsApp não sai", () => {
  const d = decideSend({
    channel: "whatsapp",
    address: "5511999999999",
    consent: false,
    suppressed: false,
    dispatchEnabled: true,
    capRemaining: 10,
  });
  assertEquals(d.status, "suppressed");
  assertEquals(d.reason, "sem opt-in de WhatsApp");
});

Deno.test("decideSend: chave geral desligada devolve skipped, não suppressed", () => {
  // A diferença importa na tela: `skipped` é trava operacional (dá para religar e reenviar),
  // `suppressed` é decisão do contato (não se reverte sozinha).
  const d = decideSend({
    channel: "email",
    address: "a@b.com",
    consent: true,
    suppressed: false,
    dispatchEnabled: false,
    capRemaining: 10,
  });
  assertEquals(d.status, "skipped");
});

Deno.test("decideSend: teto do dia estourado segura o envio", () => {
  const d = decideSend({
    channel: "email",
    address: "a@b.com",
    consent: true,
    suppressed: false,
    dispatchEnabled: true,
    capRemaining: 0,
  });
  assertEquals(d.status, "skipped");
});

Deno.test("decideSend: contato sem endereço no canal não vira envio", () => {
  const d = decideSend({
    channel: "email",
    address: "",
    consent: true,
    suppressed: false,
    dispatchEnabled: true,
    capRemaining: 10,
  });
  assertEquals(d.status, "suppressed");
});

Deno.test("decideSend: caminho feliz", () => {
  const d = decideSend({
    channel: "email",
    address: "a@b.com",
    consent: true,
    suppressed: false,
    dispatchEnabled: true,
    capRemaining: 1,
  });
  assertEquals(d.status, "queued");
});

Deno.test("evaluateCondition: numérico e texto", () => {
  assertEquals(evaluateCondition({ bookings_count: 3 }, { field: "bookings_count", op: "gte", value: 2 }), true);
  assertEquals(evaluateCondition({ bookings_count: 1 }, { field: "bookings_count", op: "gte", value: 2 }), false);
  assertEquals(
    evaluateCondition({ cohort: "recorrente" }, { field: "cohort", op: "in", value: ["recorrente", "campeao"] }),
    true,
  );
  assertEquals(
    evaluateCondition({ tags: ["vip"] }, { field: "tags", op: "contains", value: "VIP" }),
    true,
  );
});

Deno.test("evaluateCondition: campo ausente só casa com is_empty/is_false", () => {
  assertEquals(evaluateCondition({}, { field: "x", op: "is_empty" }), true);
  assertEquals(evaluateCondition({}, { field: "x", op: "gte", value: 1 }), false);
});

Deno.test("waitUntil respeita as horas e tem piso de 1 minuto", () => {
  const agora = new Date("2026-01-01T00:00:00Z");
  assertEquals(waitUntil({ hours: 48 }, agora).toISOString(), "2026-01-03T00:00:00.000Z");
  // Zero (ou lixo) não pode virar espera de 0s, senão a matrícula gira em laço apertado.
  assertEquals(waitUntil({ hours: 0 }, agora).toISOString(), "2026-01-01T00:01:00.000Z");
  assertEquals(waitUntil(undefined, agora).toISOString(), "2026-01-02T00:00:00.000Z");
});

// ── Onde o contato para e quando ele avança (correção de 25/11/2026) ──────────

Deno.test("nextStep: do começo, passa pelo gatilho e pela condição e para no envio", () => {
  const passo = nextStep(canvas, null, { bookings_count: 3 });
  assertEquals(passo.kind, "deliver");
  assertEquals(passo.kind === "deliver" ? passo.node.id : null, "e1");
});

Deno.test("nextStep: a condição manda quem deu 'não' para o outro ramo", () => {
  const passo = nextStep(canvas, null, { bookings_count: 1 });
  assertEquals(passo.kind === "deliver" ? passo.node.id : null, "e2");
});

Deno.test("nextStep: depois do envio, para na espera", () => {
  const passo = nextStep(canvas, "e1", {});
  assertEquals(passo.kind, "wait");
  assertEquals(passo.kind === "wait" ? passo.node.id : null, "w1");
});

Deno.test("nextStep: nó de saída encerra o fluxo", () => {
  assertEquals(nextStep(canvas, "w1", {}).kind, "end");
});

Deno.test("nextStep: envio sem aresta de saída também encerra (regressão: ficava ativo para sempre)", () => {
  // e2 não tem nó de saída depois dele, e o editor não exige um.
  assertEquals(nextStep(canvas, "e2", {}).kind, "end");
});

Deno.test("nextStep: condição sem o ramo pedido encerra em vez de cair no outro", () => {
  const semNao: Canvas = {
    nodes: [
      { id: "t", type: "trigger" },
      { id: "c", type: "condition", data: { field: "bookings_count", op: "gte", value: 2 } },
      { id: "e", type: "email" },
    ],
    edges: [
      { from: "t", to: "c" },
      { from: "c", to: "e", branch: "yes" },
    ],
  };
  assertEquals(nextStep(semNao, null, { bookings_count: 1 }).kind, "end");
});

Deno.test("nextStep: ciclo sem envio nem espera não prende o motor", () => {
  const ciclo: Canvas = {
    nodes: [
      { id: "t", type: "trigger" },
      { id: "a", type: "condition", data: { field: "x", op: "is_empty" } },
      { id: "b", type: "condition", data: { field: "x", op: "is_empty" } },
    ],
    edges: [
      { from: "t", to: "a" },
      { from: "a", to: "b", branch: "yes" },
      { from: "b", to: "a", branch: "yes" },
    ],
  };
  assertEquals(nextStep(ciclo, null, {}).kind, "end");
});

Deno.test("advancesAfterDelivery: enviada avança", () => {
  assertEquals(advancesAfterDelivery("sent", 0), true);
});

Deno.test("advancesAfterDelivery: bloqueada pelo contato avança (não vai mudar sozinha)", () => {
  assertEquals(advancesAfterDelivery("suppressed", 0), true);
});

Deno.test("advancesAfterDelivery: segurada não avança (regressão: o ensaio queimava o público)", () => {
  // Disparo desligado ou teto do dia: a próxima execução tem que tentar a MESMA mensagem.
  assertEquals(advancesAfterDelivery("skipped", 0), false);
});

Deno.test("advancesAfterDelivery: falha tenta de novo até o teto e depois segue", () => {
  assertEquals(advancesAfterDelivery("failed", 1), false);
  assertEquals(advancesAfterDelivery("failed", MAX_DELIVERY_ATTEMPTS - 1), false);
  assertEquals(advancesAfterDelivery("failed", MAX_DELIVERY_ATTEMPTS), true);
});
