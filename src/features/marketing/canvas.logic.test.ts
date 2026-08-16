import { describe, expect, it } from "vitest";
import {
  addNode,
  type CampaignCanvas,
  connect,
  disconnect,
  emptyCanvas,
  moveNode,
  nextNodeIdFor,
  outgoing,
  reachableNodes,
  removeNode,
  updateNodeData,
  validateCanvas,
  wouldCreateCycle,
} from "./canvas.logic";

function fluxoValido(): CampaignCanvas {
  return {
    nodes: [
      { id: "trigger", type: "trigger", x: 0, y: 0 },
      { id: "email-1", type: "email", x: 200, y: 0, data: { subject: "Oi", body: "corpo" } },
      { id: "exit-1", type: "exit", x: 400, y: 0 },
    ],
    edges: [
      { from: "trigger", to: "email-1" },
      { from: "email-1", to: "exit-1" },
    ],
  };
}

describe("montagem do canvas", () => {
  it("nasce só com a entrada", () => {
    const c = emptyCanvas();
    expect(c.nodes).toHaveLength(1);
    expect(c.nodes[0].type).toBe("trigger");
    expect(c.edges).toHaveLength(0);
  });

  it("gera id sequencial e sem colisão", () => {
    let c = emptyCanvas();
    c = addNode(c, "email", { x: 10, y: 10 });
    expect(nextNodeIdFor(c, "email")).toBe("email-2");
    c = addNode(c, "email", { x: 20, y: 20 });
    expect(c.nodes.map((n) => n.id)).toEqual(["trigger", "email-1", "email-2"]);
  });

  it("dá valores padrão úteis a cada tipo de nó", () => {
    let c = emptyCanvas();
    c = addNode(c, "wait", { x: 0, y: 0 });
    c = addNode(c, "email", { x: 0, y: 0 });
    expect(c.nodes.find((n) => n.id === "wait-1")?.data).toEqual({ hours: 24 });
    expect(c.nodes.find((n) => n.id === "email-1")?.data).toEqual({ subject: "", body: "" });
  });

  it("não deixa o nó ser arrastado para coordenada negativa", () => {
    let c = addNode(emptyCanvas(), "email", { x: 100, y: 100 });
    c = moveNode(c, "email-1", { x: -50, y: -20 });
    const n = c.nodes.find((x) => x.id === "email-1");
    expect(n?.x).toBe(0);
    expect(n?.y).toBe(0);
  });

  it("atualiza só o nó pedido", () => {
    let c = addNode(emptyCanvas(), "email", { x: 0, y: 0 });
    c = updateNodeData(c, "email-1", { subject: "Novo" });
    expect(c.nodes.find((n) => n.id === "email-1")?.data).toMatchObject({
      subject: "Novo",
      body: "",
    });
  });

  it("remover um nó leva junto as arestas dele", () => {
    const c = removeNode(fluxoValido(), "email-1");
    expect(c.nodes.map((n) => n.id)).toEqual(["trigger", "exit-1"]);
    expect(c.edges).toHaveLength(0);
  });

  it("a entrada não pode ser removida", () => {
    const c = removeNode(fluxoValido(), "trigger");
    expect(c.nodes.some((n) => n.id === "trigger")).toBe(true);
  });
});

describe("ligações", () => {
  it("reconectar a mesma saída substitui em vez de acumular", () => {
    let c = fluxoValido();
    c = addNode(c, "email", { x: 600, y: 0 });
    c = connect(c, "trigger", "email-2");
    const saindoDoTrigger = c.edges.filter((e) => e.from === "trigger");
    expect(saindoDoTrigger).toHaveLength(1);
    expect(saindoDoTrigger[0].to).toBe("email-2");
  });

  it("guarda sim e não como arestas independentes", () => {
    let c = emptyCanvas();
    c = addNode(c, "condition", { x: 200, y: 0 });
    c = addNode(c, "email", { x: 400, y: 0 });
    c = addNode(c, "exit", { x: 400, y: 200 });
    c = connect(c, "condition-1", "email-1", "yes");
    c = connect(c, "condition-1", "exit-1", "no");
    expect(outgoing(c, "condition-1", "yes")?.to).toBe("email-1");
    expect(outgoing(c, "condition-1", "no")?.to).toBe("exit-1");
  });

  it("recusa ciclo", () => {
    const c = fluxoValido();
    expect(wouldCreateCycle(c, "exit-1", "trigger")).toBe(true);
    const depois = connect(c, "exit-1", "trigger");
    expect(depois.edges).toHaveLength(2);
  });

  it("recusa laço no próprio nó", () => {
    const c = connect(fluxoValido(), "email-1", "email-1");
    expect(c.edges.some((e) => e.from === "email-1" && e.to === "email-1")).toBe(false);
  });

  it("ignora ligação para nó que não existe", () => {
    const c = connect(fluxoValido(), "trigger", "fantasma");
    expect(c.edges.some((e) => e.to === "fantasma")).toBe(false);
  });

  it("desconectar remove só o ramo pedido", () => {
    let c = emptyCanvas();
    c = addNode(c, "condition", { x: 0, y: 0 });
    c = addNode(c, "email", { x: 0, y: 0 });
    c = addNode(c, "exit", { x: 0, y: 0 });
    c = connect(c, "condition-1", "email-1", "yes");
    c = connect(c, "condition-1", "exit-1", "no");
    c = disconnect(c, "condition-1", "yes");
    expect(outgoing(c, "condition-1", "yes")).toBeUndefined();
    expect(outgoing(c, "condition-1", "no")?.to).toBe("exit-1");
  });
});

describe("validação antes de disparar", () => {
  it("fluxo completo não reclama", () => {
    expect(validateCanvas(fluxoValido())).toEqual([]);
  });

  it("aponta e-mail sem assunto e sem corpo", () => {
    const c = fluxoValido();
    c.nodes[1].data = { subject: "", body: "" };
    const msgs = validateCanvas(c).map((p) => p.message);
    expect(msgs).toContain("E-mail sem assunto.");
    expect(msgs).toContain("E-mail sem corpo.");
  });

  it("aponta WhatsApp sem template", () => {
    let c = emptyCanvas();
    c = addNode(c, "whatsapp", { x: 200, y: 0 });
    c = connect(c, "trigger", "whatsapp-1");
    expect(validateCanvas(c).some((p) => p.message.includes("sem template"))).toBe(true);
  });

  it("cobra as duas saídas da condição", () => {
    let c = emptyCanvas();
    c = addNode(c, "condition", { x: 200, y: 0 });
    c = addNode(c, "email", { x: 400, y: 0 });
    c.nodes[2].data = { subject: "a", body: "b" };
    c = connect(c, "trigger", "condition-1");
    c = connect(c, "condition-1", "email-1", "yes");
    const msgs = validateCanvas(c).map((p) => p.message);
    expect(msgs.some((m) => m.includes('saída "não"'))).toBe(true);
    expect(msgs.some((m) => m.includes('saída "sim"'))).toBe(false);
  });

  it("reclama de fluxo sem nenhum envio", () => {
    let c = emptyCanvas();
    c = addNode(c, "exit", { x: 200, y: 0 });
    c = connect(c, "trigger", "exit-1");
    expect(
      validateCanvas(c).some((p) => p.message.includes("nenhum envio")),
    ).toBe(true);
  });

  it("reclama de nó solto", () => {
    let c = fluxoValido();
    c = addNode(c, "email", { x: 800, y: 0 });
    c = updateNodeData(c, "email-2", { subject: "a", body: "b" });
    expect(validateCanvas(c).some((p) => p.message.includes("está solto"))).toBe(true);
  });

  it("reclama de espera com tempo zero", () => {
    let c = emptyCanvas();
    c = addNode(c, "wait", { x: 200, y: 0 });
    c = updateNodeData(c, "wait-1", { hours: 0 });
    c = connect(c, "trigger", "wait-1");
    expect(validateCanvas(c).some((p) => p.message.includes("maior que zero"))).toBe(true);
  });

  it("reclama de entrada que não leva a lugar nenhum", () => {
    const c = emptyCanvas();
    expect(
      validateCanvas(c).some((p) => p.message.includes("não leva a lugar nenhum")),
    ).toBe(true);
  });
});

describe("alcance", () => {
  it("lista só quem a entrada alcança", () => {
    let c = fluxoValido();
    c = addNode(c, "email", { x: 900, y: 0 });
    const vistos = reachableNodes(c);
    expect(vistos.has("email-1")).toBe(true);
    expect(vistos.has("exit-1")).toBe(true);
    expect(vistos.has("email-2")).toBe(false);
  });
});
