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
  | { type: "ul"; items: InlineToken[][] }
  // Citação (`> `): é onde a Mia para operadores põe a mensagem pronta para o cliente, e a
  // bolinha do operador mostra um botão de copiar nela. `raw` é o texto sem marcação, que é o
  // que vai para a área de transferência.
  | { type: "quote"; lines: InlineToken[][]; raw: string };

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
  let quote: string[] = [];

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
  const flushQuote = () => {
    if (quote.length) {
      blocks.push({
        type: "quote",
        lines: quote.map(parseInline),
        raw: quote.join("\n").replace(/\*\*(.+?)\*\*/g, "$1"),
      });
      quote = [];
    }
  };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const citacao = line.match(/^\s*>\s?(.*)$/);
    const bullet = line.match(/^\s*[*-]\s+(.*)$/);
    // Título em markdown (`### O que fazer`) vira uma linha em negrito: o modelo às vezes usa, e
    // sem isto o "###" aparecia cru na bolha.
    const titulo = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (titulo) {
      flushPara();
      flushList();
      flushQuote();
      blocks.push({ type: "p", spans: [{ bold: true, text: titulo[1].replace(/\*\*/g, "").trim() }] });
    } else if (citacao) {
      flushPara();
      flushList();
      quote.push(citacao[1]);
    } else if (bullet) {
      flushPara();
      flushQuote();
      items.push(parseInline(bullet[1]));
    } else if (line.trim() === "") {
      flushPara();
      flushList();
      flushQuote();
    } else {
      flushList();
      flushQuote();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  flushQuote();
  return blocks;
}
