// Prontidão do fluxo de campanha: o que impede uma execução honesta.
//
// Espelho de `validateCanvas` em src/features/marketing/canvas.logic.ts. O front usa a dele para
// mostrar o problema na hora; esta é a que vale, porque o motor (run.ts) recusa executar fluxo com
// problema, e tela e IA executam pelo mesmo motor. Os mesmos casos de teste rodam dos dois lados
// (canvas.test.ts aqui, canvas.logic.test.ts lá). Mudou lá, muda aqui.
// Spec: docs/specs/marketing-mcp.md § 3.

import type { Canvas, NodeType } from "./engine.ts";

export type CanvasProblem = { nodeId: string | null; message: string };

const NODE_LABELS: Record<NodeType, string> = {
  trigger: "Entrada",
  email: "E-mail",
  whatsapp: "WhatsApp",
  wait: "Espera",
  condition: "Condição",
  exit: "Fim",
};

function outgoing(canvas: Canvas, from: string, branch?: "yes" | "no") {
  return canvas.edges.find((e) => e.from === from && (branch ? e.branch === branch : !e.branch));
}

export function validateCanvas(canvas: Canvas): CanvasProblem[] {
  const problemas: CanvasProblem[] = [];
  const nodes = Array.isArray(canvas?.nodes) ? canvas.nodes : [];
  const edges = Array.isArray(canvas?.edges) ? canvas.edges : [];
  const c: Canvas = { nodes, edges };
  const gatilho = nodes.find((n) => n.type === "trigger");

  if (!gatilho) {
    problemas.push({ nodeId: null, message: "O fluxo não tem nó de entrada." });
  } else if (!edges.some((e) => e.from === gatilho.id)) {
    problemas.push({
      nodeId: gatilho.id,
      message: "A entrada não leva a lugar nenhum. Ligue o primeiro passo.",
    });
  }

  if (!nodes.some((n) => n.type === "email" || n.type === "whatsapp")) {
    problemas.push({ nodeId: null, message: "O fluxo não tem nenhum envio de e-mail ou WhatsApp." });
  }

  for (const node of nodes) {
    if (node.type === "email") {
      if (!String(node.data?.subject ?? "").trim()) {
        problemas.push({ nodeId: node.id, message: "E-mail sem assunto." });
      }
      if (!String(node.data?.body ?? "").trim()) {
        problemas.push({ nodeId: node.id, message: "E-mail sem corpo." });
      }
    }
    if (node.type === "whatsapp" && !String(node.data?.template ?? "").trim()) {
      problemas.push({
        nodeId: node.id,
        message: "WhatsApp sem template. A Meta recusa envio sem template aprovado.",
      });
    }
    if (node.type === "condition") {
      for (const ramo of ["yes", "no"] as const) {
        if (!outgoing(c, node.id, ramo)) {
          problemas.push({
            nodeId: node.id,
            message: `A condição não tem saída "${ramo === "yes" ? "sim" : "não"}". Quem cair nesse lado para aqui.`,
          });
        }
      }
    }
    if (node.type === "wait") {
      const horas = Number(node.data?.hours ?? 0);
      if (!Number.isFinite(horas) || horas <= 0) {
        problemas.push({ nodeId: node.id, message: "A espera precisa de um tempo maior que zero." });
      }
    }
    if (node.type !== "trigger" && !edges.some((e) => e.to === node.id)) {
      problemas.push({
        nodeId: node.id,
        message: `O passo "${NODE_LABELS[node.type] ?? node.type}" está solto, sem ninguém chegando nele.`,
      });
    }
  }

  return problemas;
}
