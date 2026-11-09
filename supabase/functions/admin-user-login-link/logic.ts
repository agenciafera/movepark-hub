// Lógica pura do link de acesso de usuário (Manager › Usuários). Testável com `deno test`.

import { normalizeEmail } from "../invite-company-member/logic.ts";

export type LoginLinkInput = { user_id: string; send_email: boolean };

/** Valida o corpo do pedido. Devolve o erro pronto para a resposta 400. */
export function parseLoginLinkInput(
  body: unknown,
): { ok: true; input: LoginLinkInput } | { ok: false; error: string } {
  const b = (body ?? {}) as { user_id?: unknown; send_email?: unknown };
  const userId = typeof b.user_id === "string" ? b.user_id.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, error: "user_id é obrigatório." };
  return { ok: true, input: { user_id: userId, send_email: b.send_email === true } };
}

/** O e-mail da conta vem de auth.users (ADR-006), nunca do corpo do pedido. */
export function accountEmail(raw: unknown): string | null {
  return normalizeEmail(raw);
}
