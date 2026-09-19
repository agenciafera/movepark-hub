// Período do relatório por canal (E0.3.12). Lógica pura.

export type MonthOption = { value: string; label: string; from: string; to: string };

/** Os últimos `n` meses, do atual para trás, com o intervalo [from, to) em UTC. */
export function recentMonths(n: number, now: Date = new Date()): MonthOption[] {
  const out: MonthOption[] = [];
  for (let i = 0; i < n; i++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    const label = start.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    out.push({ value: start.toISOString().slice(0, 7), label, from: start.toISOString(), to: end.toISOString() });
  }
  return out;
}

/** Nome do canal na tela: `hub` é a venda da própria Movepark. */
export function channelLabel(channel: string, fromRule: boolean): string {
  return fromRule ? channel : "Movepark (busca e site)";
}
