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
