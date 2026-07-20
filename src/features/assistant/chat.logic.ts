// Lógica pura do web chat (bolinha) — testável sem React. Ver docs/specs/chatbot.md (E3.3).

export type ChatRole = "user" | "model";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

/** Mensagens enviadas à Edge `chat` (sem id, só role+text com conteúdo). */
export function toRequestMessages(messages: ChatMessage[]): Array<{ role: ChatRole; text: string }> {
  return messages.filter((m) => m.text.trim()).map((m) => ({ role: m.role, text: m.text }));
}

let seq = 0;
function nextId(role: ChatRole): string {
  seq += 1;
  return `${role}-${seq}`;
}

export function appendMessage(messages: ChatMessage[], role: ChatRole, text: string): ChatMessage[] {
  return [...messages, { id: nextId(role), role, text }];
}

/** Habilita o envio: há texto e não está aguardando resposta. */
export function canSend(input: string, pending: boolean): boolean {
  return input.trim().length > 0 && !pending;
}

// ── Formatação da resposta do assistente ─────────────────────────────────────
// O modelo responde em markdown (negrito com **, listas com * ou -). O widget renderiza este
// subconjunto como React (sem innerHTML, sem dependência). Só o essencial: parágrafo, lista, negrito.

export type InlineToken = { bold: boolean; text: string };
export type ChatBlock =
  | { type: "p"; spans: InlineToken[] }
  | { type: "ul"; items: InlineToken[][] };

/** Quebra uma linha em trechos normais e em negrito (**assim**). */
export function parseInline(line: string): InlineToken[] {
  const out: InlineToken[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ bold: false, text: line.slice(last, m.index) });
    out.push({ bold: true, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ bold: false, text: line.slice(last) });
  return out.length ? out : [{ bold: false, text: line }];
}

/** Markdown do assistente → blocos (parágrafos e listas). Linhas vazias separam parágrafos. */
export function parseChatMarkdown(text: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let para: string[] = [];
  let items: InlineToken[][] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "p", spans: parseInline(para.join(" ")) });
      para = [];
    }
  };
  const flushList = () => {
    if (items.length) {
      blocks.push({ type: "ul", items });
      items = [];
    }
  };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[*-]\s+(.*)$/);
    if (bullet) {
      flushPara();
      items.push(parseInline(bullet[1]));
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}
