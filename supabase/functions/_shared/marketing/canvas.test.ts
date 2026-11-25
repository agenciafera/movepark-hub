// Mesmos casos de src/features/marketing/canvas.logic.test.ts ("validação antes de disparar").
// Os dois lados rodam os mesmos casos para travar divergência entre a tela e o motor.
import { assertEquals } from "jsr:@std/assert";
import type { Canvas } from "./engine.ts";
import { validateCanvas } from "./canvas.ts";

function fluxoValido(): Canvas {
  return {
    nodes: [
      { id: "trigger", type: "trigger" },
      { id: "email-1", type: "email", data: { subject: "Oi", body: "corpo" } },
      { id: "exit-1", type: "exit" },
    ],
    edges: [
      { from: "trigger", to: "email-1" },
      { from: "email-1", to: "exit-1" },
    ],
  };
}

const msgs = (c: Canvas) => validateCanvas(c).map((p) => p.message);

Deno.test("fluxo completo não reclama", () => {
  assertEquals(validateCanvas(fluxoValido()), []);
});

Deno.test("aponta e-mail sem assunto e sem corpo", () => {
  const c = fluxoValido();
  c.nodes[1].data = { subject: "", body: "" };
  assertEquals(msgs(c).includes("E-mail sem assunto."), true);
  assertEquals(msgs(c).includes("E-mail sem corpo."), true);
});

Deno.test("aponta WhatsApp sem template", () => {
  const c: Canvas = {
    nodes: [{ id: "trigger", type: "trigger" }, { id: "whatsapp-1", type: "whatsapp" }],
    edges: [{ from: "trigger", to: "whatsapp-1" }],
  };
  assertEquals(msgs(c).some((m) => m.includes("sem template")), true);
});

Deno.test("cobra as duas saídas da condição", () => {
  const c: Canvas = {
    nodes: [
      { id: "trigger", type: "trigger" },
      { id: "condition-1", type: "condition" },
      { id: "email-1", type: "email", data: { subject: "a", body: "b" } },
    ],
    edges: [
      { from: "trigger", to: "condition-1" },
      { from: "condition-1", to: "email-1", branch: "yes" },
    ],
  };
  assertEquals(msgs(c).some((m) => m.includes('saída "não"')), true);
  assertEquals(msgs(c).some((m) => m.includes('saída "sim"')), false);
});

Deno.test("reclama de fluxo sem nenhum envio", () => {
  const c: Canvas = {
    nodes: [{ id: "trigger", type: "trigger" }, { id: "exit-1", type: "exit" }],
    edges: [{ from: "trigger", to: "exit-1" }],
  };
  assertEquals(msgs(c).some((m) => m.includes("nenhum envio")), true);
});

Deno.test("reclama de nó solto", () => {
  const c = fluxoValido();
  c.nodes.push({ id: "email-2", type: "email", data: { subject: "a", body: "b" } });
  assertEquals(msgs(c).some((m) => m.includes("está solto")), true);
});

Deno.test("reclama de espera com tempo zero", () => {
  const c: Canvas = {
    nodes: [{ id: "trigger", type: "trigger" }, { id: "wait-1", type: "wait", data: { hours: 0 } }],
    edges: [{ from: "trigger", to: "wait-1" }],
  };
  assertEquals(msgs(c).some((m) => m.includes("maior que zero")), true);
});

Deno.test("reclama de entrada que não leva a lugar nenhum", () => {
  const c: Canvas = { nodes: [{ id: "trigger", type: "trigger" }], edges: [] };
  assertEquals(msgs(c).some((m) => m.includes("não leva a lugar nenhum")), true);
});
