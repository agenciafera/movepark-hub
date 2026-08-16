/**
 * Regras do canvas de campanha (o editor arrastar-e-soltar, no espírito do Mautic e do RD).
 *
 * Só lógica: criar nó, ligar, desligar, mover, validar. O componente cuida do ponteiro e do
 * desenho. Separado assim porque é aqui que moram os erros que estragam um disparo (fluxo sem
 * saída, ciclo infinito, e-mail sem assunto), e isso precisa de teste sem DOM.
 *
 * O mesmo formato é lido pela Edge `marketing-run` (supabase/functions/marketing-run/engine.ts).
 * Tipo de nó novo entra nos dois lugares.
 */

export type CampaignNodeType = "trigger" | "email" | "whatsapp" | "wait" | "condition" | "exit";

export type CampaignNode = {
  id: string;
  type: CampaignNodeType;
  x: number;
  y: number;
  data?: Record<string, unknown>;
};

export type CampaignEdge = {
  from: string;
  to: string;
  branch?: "yes" | "no";
};

export type CampaignCanvas = {
  nodes: CampaignNode[];
  edges: CampaignEdge[];
};

export const NODE_LIBRARY: Array<{
  type: CampaignNodeType;
  label: string;
  hint: string;
}> = [
  { type: "email", label: "E-mail", hint: "Manda um e-mail para quem chegou até aqui." },
  { type: "whatsapp", label: "WhatsApp", hint: "Manda um template aprovado na Meta." },
  { type: "wait", label: "Espera", hint: "Segura a pessoa por um tempo antes do próximo passo." },
  { type: "condition", label: "Condição", hint: "Divide o fluxo em dois caminhos: sim e não." },
  { type: "exit", label: "Fim", hint: "Encerra a jornada." },
];

export const NODE_LABELS: Record<CampaignNodeType, string> = {
  trigger: "Entrada",
  email: "E-mail",
  whatsapp: "WhatsApp",
  wait: "Espera",
  condition: "Condição",
  exit: "Fim",
};

/** Só a condição tem duas saídas. É o que a UI usa para desenhar dois pontos de conexão. */
export function nodeOutlets(type: CampaignNodeType): Array<"yes" | "no" | "next"> {
  if (type === "condition") return ["yes", "no"];
  if (type === "exit") return [];
  return ["next"];
}

export function emptyCanvas(): CampaignCanvas {
  return {
    nodes: [{ id: "trigger", type: "trigger", x: 40, y: 40, data: {} }],
    edges: [],
  };
}

/**
 * Id novo. Usa contador sobre os ids existentes em vez de random/timestamp para o canvas ser
 * reproduzível em teste e o diff do jsonb ficar legível na revisão.
 */
export function nextNodeIdFor(canvas: CampaignCanvas, type: CampaignNodeType): string {
  let n = 1;
  while (canvas.nodes.some((node) => node.id === `${type}-${n}`)) n += 1;
  return `${type}-${n}`;
}

export function addNode(
  canvas: CampaignCanvas,
  type: CampaignNodeType,
  pos: { x: number; y: number },
): CampaignCanvas {
  const id = nextNodeIdFor(canvas, type);
  const data: Record<string, unknown> =
    type === "wait"
      ? { hours: 24 }
      : type === "condition"
        ? { field: "bookings_count", op: "gte", value: 2 }
        : type === "email"
          ? { subject: "", body: "" }
          : type === "whatsapp"
            ? { template: "", params: [] }
            : {};
  return {
    ...canvas,
    nodes: [...canvas.nodes, { id, type, x: Math.round(pos.x), y: Math.round(pos.y), data }],
  };
}

export function moveNode(
  canvas: CampaignCanvas,
  id: string,
  pos: { x: number; y: number },
): CampaignCanvas {
  return {
    ...canvas,
    // Piso em zero: nó arrastado para fora pela borda esquerda/topo ficaria inalcançável.
    nodes: canvas.nodes.map((n) =>
      n.id === id ? { ...n, x: Math.max(0, Math.round(pos.x)), y: Math.max(0, Math.round(pos.y)) } : n,
    ),
  };
}

export function updateNodeData(
  canvas: CampaignCanvas,
  id: string,
  patch: Record<string, unknown>,
): CampaignCanvas {
  return {
    ...canvas,
    nodes: canvas.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
  };
}

/** Remover um nó leva junto as arestas dele. Aresta órfã trava o motor no meio do fluxo. */
export function removeNode(canvas: CampaignCanvas, id: string): CampaignCanvas {
  if (id === "trigger") return canvas;
  return {
    nodes: canvas.nodes.filter((n) => n.id !== id),
    edges: canvas.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

/**
 * Liga dois nós. Uma saída tem no máximo um destino, então reconectar substitui em vez de
 * acumular: com duas arestas na mesma saída, o motor escolheria uma e a outra ficaria invisível.
 */
export function connect(
  canvas: CampaignCanvas,
  from: string,
  to: string,
  branch?: "yes" | "no",
): CampaignCanvas {
  if (from === to) return canvas;
  if (!canvas.nodes.some((n) => n.id === from) || !canvas.nodes.some((n) => n.id === to)) {
    return canvas;
  }
  if (wouldCreateCycle(canvas, from, to)) return canvas;

  const semAntiga = canvas.edges.filter(
    (e) => !(e.from === from && (branch ? e.branch === branch : !e.branch)),
  );
  return { ...canvas, edges: [...semAntiga, { from, to, ...(branch ? { branch } : {}) }] };
}

export function disconnect(
  canvas: CampaignCanvas,
  from: string,
  branch?: "yes" | "no",
): CampaignCanvas {
  return {
    ...canvas,
    edges: canvas.edges.filter(
      (e) => !(e.from === from && (branch ? e.branch === branch : !e.branch)),
    ),
  };
}

/**
 * A aresta `from → to` fecharia um ciclo? O motor tem trava de 20 voltas, mas um ciclo montado na
 * tela é sempre erro de quem montou, e barrar na hora ensina mais do que falhar no disparo.
 */
export function wouldCreateCycle(canvas: CampaignCanvas, from: string, to: string): boolean {
  if (from === to) return true;
  const visitados = new Set<string>();
  const fila = [to];
  while (fila.length) {
    const atual = fila.shift() as string;
    if (atual === from) return true;
    if (visitados.has(atual)) continue;
    visitados.add(atual);
    for (const e of canvas.edges) {
      if (e.from === atual) fila.push(e.to);
    }
  }
  return false;
}

export function outgoing(canvas: CampaignCanvas, from: string, branch?: "yes" | "no") {
  return canvas.edges.find((e) => e.from === from && (branch ? e.branch === branch : !e.branch));
}

export type CanvasProblem = { nodeId: string | null; message: string };

/**
 * Problemas que impedem uma execução honesta. A tela mostra tudo antes de deixar disparar, porque
 * campanha é irreversível: e-mail com assunto vazio já saiu quando alguém percebe.
 */
export function validateCanvas(canvas: CampaignCanvas): CanvasProblem[] {
  const problemas: CanvasProblem[] = [];
  const gatilho = canvas.nodes.find((n) => n.type === "trigger");

  if (!gatilho) {
    problemas.push({ nodeId: null, message: "O fluxo não tem nó de entrada." });
  } else if (!canvas.edges.some((e) => e.from === gatilho.id)) {
    problemas.push({
      nodeId: gatilho.id,
      message: "A entrada não leva a lugar nenhum. Ligue o primeiro passo.",
    });
  }

  const temEnvio = canvas.nodes.some((n) => n.type === "email" || n.type === "whatsapp");
  if (!temEnvio) {
    problemas.push({ nodeId: null, message: "O fluxo não tem nenhum envio de e-mail ou WhatsApp." });
  }

  for (const node of canvas.nodes) {
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
        if (!outgoing(canvas, node.id, ramo)) {
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
    // Nó solto não recebe ninguém: é trabalho que não vai rodar.
    if (node.type !== "trigger" && !canvas.edges.some((e) => e.to === node.id)) {
      problemas.push({
        nodeId: node.id,
        message: `O passo "${NODE_LABELS[node.type]}" está solto, sem ninguém chegando nele.`,
      });
    }
  }

  return problemas;
}

/** Nós alcançáveis a partir da entrada. A tela apaga o resto para deixar o erro óbvio. */
export function reachableNodes(canvas: CampaignCanvas): Set<string> {
  const inicio = canvas.nodes.find((n) => n.type === "trigger")?.id;
  const vistos = new Set<string>();
  if (!inicio) return vistos;
  const fila = [inicio];
  while (fila.length) {
    const atual = fila.shift() as string;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    for (const e of canvas.edges) if (e.from === atual) fila.push(e.to);
  }
  return vistos;
}
