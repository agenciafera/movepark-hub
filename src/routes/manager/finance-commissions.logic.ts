// Lógica pura da edição de comissão (take_rate). Sem React/Supabase → testável (Vitest).
// O banco guarda em basis points (1500 = 15%); a UI fala em porcentagem.

/** bps → "%": 1500 → 15. Mantém até 2 casas, sem zeros à toa. */
export function bpsToPctString(bps: number): string {
  return String(Math.round(bps) / 100);
}

/**
 * Lê o input de porcentagem do usuário e devolve os basis points, ou um erro.
 * Aceita vírgula ou ponto; faixa 0–100%.
 */
export function parseCommissionPct(input: string): { bps: number } | { error: string } {
  const trimmed = input.trim().replace("%", "").replace(",", ".");
  if (trimmed === "") return { error: "Informe a comissão." };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { error: "Informe um número válido." };
  if (n < 0 || n > 100) return { error: "A comissão deve ficar entre 0% e 100%." };
  return { bps: Math.round(n * 100) };
}

/** Houve mudança real entre o valor salvo (bps) e o que está no input (%)? */
export function isCommissionDirty(savedBps: number, input: string): boolean {
  const parsed = parseCommissionPct(input);
  if ("error" in parsed) return false; // input inválido não conta como "sujo salvável"
  return parsed.bps !== savedBps;
}
