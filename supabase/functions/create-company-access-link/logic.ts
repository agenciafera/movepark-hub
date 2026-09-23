// Lógica pura do link de acesso ao Recebimento (23/09/2026). Testável com `deno test`.

import { normalizeEmail } from "../invite-company-member/logic.ts";

export type CreateInput = { company_id: string; email: string };

/** Valida o corpo do pedido. Devolve o erro pronto para a resposta 400. */
export function parseCreateInput(body: unknown): { ok: true; input: CreateInput } | { ok: false; error: string } {
  const b = (body ?? {}) as { company_id?: unknown; email?: unknown };
  const companyId = typeof b.company_id === "string" ? b.company_id.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return { ok: false, error: "company_id é obrigatório." };
  const email = normalizeEmail(b.email);
  if (!email) return { ok: false, error: "E-mail inválido." };
  return { ok: true, input: { company_id: companyId, email } };
}

/** URL pública do link: o segredo vai no caminho, e a página /acesso resgata. */
export function accessUrl(site: string, secret: string): string {
  return `${site.replace(/\/$/, "")}/acesso/${secret}`;
}
