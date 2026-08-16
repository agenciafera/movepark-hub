// Lógica pura do motor de campanha: caminhar pelo canvas, resolver merge tags e decidir se uma
// mensagem pode sair. Fica separada do index.ts porque é o miolo que precisa de teste (deno test)
// sem subir Supabase nem SMTP.

export type NodeType = "trigger" | "email" | "whatsapp" | "wait" | "condition" | "exit";

export interface CanvasNode {
  id: string;
  type: NodeType;
  data?: Record<string, unknown>;
}

export interface CanvasEdge {
  from: string;
  to: string;
  /** Só no nó de condição: por qual saída a aresta corre. */
  branch?: "yes" | "no";
}

export interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/**
 * Primeiro nó a executar: o gatilho. Se o canvas não tiver um, cai no primeiro nó sem aresta
 * de entrada. Um canvas montado na mão (ou importado) pode não ter gatilho, e é melhor rodar a
 * partir do começo óbvio do que não rodar.
 */
export function startNodeId(canvas: Canvas): string | null {
  const trigger = canvas.nodes.find((n) => n.type === "trigger");
  if (trigger) return trigger.id;
  const alvos = new Set(canvas.edges.map((e) => e.to));
  return canvas.nodes.find((n) => !alvos.has(n.id))?.id ?? null;
}

/**
 * Próximo nó. `branch` só importa depois de uma condição: a aresta "yes" leva ao caminho de quem
 * casou. Quando a condição não tem a saída pedida, o fluxo termina em vez de cair na outra ponta,
 * porque mandar o e-mail do "sim" para quem deu "não" é pior do que não mandar nada.
 */
export function nextNodeId(
  canvas: Canvas,
  fromId: string,
  branch?: "yes" | "no",
): string | null {
  const saindo = canvas.edges.filter((e) => e.from === fromId);
  if (saindo.length === 0) return null;
  if (branch) return saindo.find((e) => e.branch === branch)?.to ?? null;
  // Fora de condição, uma aresta sem rótulo é o caminho normal.
  return (saindo.find((e) => !e.branch) ?? saindo[0]).to;
}

export function findNode(canvas: Canvas, id: string | null): CanvasNode | null {
  if (!id) return null;
  return canvas.nodes.find((n) => n.id === id) ?? null;
}

/** Escapa o que vai para dentro do HTML do e-mail. O nome do contato é dado de fora. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Substitui as marcações {{campo}} pelo dado do contato.
 *
 * Campo desconhecido ou vazio vira string vazia, nunca "{{nome}}" cru e nunca "undefined": a copy
 * quebrada aparece para o cliente e não tem como voltar atrás depois do envio.
 */
export function renderMergeTags(
  texto: string,
  doc: Record<string, unknown>,
  opts?: { escape?: boolean },
): string {
  const escapar = opts?.escape ?? false;
  const nomeCompleto = String(doc.display_name ?? "").trim();
  const primeiroNome = nomeCompleto.split(/\s+/)[0] ?? "";

  const valores: Record<string, string> = {
    nome: primeiroNome,
    primeiro_nome: primeiroNome,
    nome_completo: nomeCompleto,
    email: String(doc.email ?? ""),
    reservas: String(doc.bookings_count ?? 0),
    ticket_medio: BRL.format(Number(doc.avg_ticket ?? 0)),
    total_gasto: BRL.format(Number(doc.total_spent ?? 0)),
    dias_sem_comprar: doc.days_since_last == null ? "" : String(doc.days_since_last),
    carro: String(doc.vehicle_model ?? ""),
  };

  return texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_todo, chave: string) => {
    const bruto = valores[chave.toLowerCase()] ?? "";
    return escapar ? escapeHtml(bruto) : bruto;
  });
}

export type SendStatus = "queued" | "skipped" | "suppressed";

export interface SendDecision {
  status: SendStatus;
  /** Motivo legível, gravado em marketing_message.error para a tela explicar o que houve. */
  reason?: string;
}

/**
 * Decide se a mensagem sai. A ordem importa e é a mesma da lei antes do produto:
 * supressão (bounce/reclamação) vence tudo, depois consentimento, depois endereço, e só no fim
 * as travas operacionais (chave geral e teto do dia).
 */
export function decideSend(input: {
  channel: "email" | "whatsapp";
  address: string | null | undefined;
  consent: boolean;
  suppressed: boolean;
  dispatchEnabled: boolean;
  capRemaining: number;
}): SendDecision {
  if (input.suppressed) {
    return { status: "suppressed", reason: "contato na lista de supressão" };
  }
  if (!input.consent) {
    return {
      status: "suppressed",
      reason:
        input.channel === "whatsapp"
          ? "sem opt-in de WhatsApp"
          : "sem consentimento de e-mail",
    };
  }
  if (!input.address || !String(input.address).trim()) {
    return { status: "suppressed", reason: "contato sem endereço neste canal" };
  }
  if (!input.dispatchEnabled) {
    return { status: "skipped", reason: "disparo desligado (marketing_dispatch_enabled)" };
  }
  if (input.capRemaining <= 0) {
    return { status: "skipped", reason: "teto de envio do dia atingido" };
  }
  return { status: "queued" };
}

/**
 * Avalia o nó de condição contra o documento do contato. Usa os mesmos operadores do segmento,
 * para a pessoa que monta a campanha não ter que aprender duas gramáticas de filtro.
 */
export function evaluateCondition(
  doc: Record<string, unknown>,
  data: Record<string, unknown> | undefined,
): boolean {
  const campo = String(data?.field ?? "");
  const op = String(data?.op ?? "eq");
  const alvo = data?.value;
  if (!campo) return true;

  const atual = doc[campo];
  if (atual === null || atual === undefined) return op === "is_empty" || op === "is_false";

  switch (op) {
    case "is_empty":
      return false;
    case "is_present":
      return true;
    case "is_true":
      return atual === true;
    case "is_false":
      return atual === false;
  }

  const numAtual = Number(atual);
  const numAlvo = Number(alvo);
  if (!Number.isNaN(numAtual) && !Number.isNaN(numAlvo) && typeof alvo !== "string") {
    switch (op) {
      case "eq":
        return numAtual === numAlvo;
      case "neq":
        return numAtual !== numAlvo;
      case "gt":
        return numAtual > numAlvo;
      case "gte":
        return numAtual >= numAlvo;
      case "lt":
        return numAtual < numAlvo;
      case "lte":
        return numAtual <= numAlvo;
    }
  }

  const txtAtual = String(atual).toLowerCase();
  if (op === "in" && Array.isArray(alvo)) {
    return alvo.map((v) => String(v).toLowerCase()).includes(txtAtual);
  }
  if (op === "not_in" && Array.isArray(alvo)) {
    return !alvo.map((v) => String(v).toLowerCase()).includes(txtAtual);
  }
  if (op === "contains") {
    if (Array.isArray(atual)) {
      return atual.map((v) => String(v).toLowerCase()).includes(String(alvo).toLowerCase());
    }
    return txtAtual.includes(String(alvo).toLowerCase());
  }
  if (op === "neq") return txtAtual !== String(alvo).toLowerCase();
  return txtAtual === String(alvo).toLowerCase();
}

/** Horas de espera do nó `wait`, com piso de 1 minuto para um zero não virar laço apertado. */
export function waitUntil(data: Record<string, unknown> | undefined, agora: Date): Date {
  const horas = Number(data?.hours ?? 24);
  const ms = Number.isFinite(horas) && horas > 0 ? horas * 3600_000 : 60_000;
  return new Date(agora.getTime() + Math.max(ms, 60_000));
}
