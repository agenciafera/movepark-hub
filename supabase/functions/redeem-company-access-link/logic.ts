// Lógica pura do resgate do link de acesso (23/09/2026). Testável com `deno test`.

/** Para onde o dono cai depois de logar pelo link. */
export const NEXT_PATH = "/operator/recebimento";

/** Extrai o segredo do corpo. Vazio ou não-string vira null. */
export function parseSecret(body: unknown): string | null {
  const t = (body as { token?: unknown } | null)?.token;
  if (typeof t !== "string") return null;
  const s = t.trim();
  return s.length >= 16 ? s : null;
}

/** Resposta HTTP para um resgate recusado pela RPC, por motivo. */
export function refusal(reason: unknown): { status: number; body: { error: string; reason: string } } {
  if (reason === "done") {
    return { status: 410, body: { error: "O cadastro de recebimento desta empresa já foi concluído.", reason: "done" } };
  }
  return { status: 410, body: { error: "Link inválido ou revogado.", reason: "invalid" } };
}
