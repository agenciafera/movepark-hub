import type { PayoutAutoForecast } from "./api";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "10 de out" a partir de uma data ISO (YYYY-MM-DD), sem fuso. */
export function diaMes(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} de ${MESES[(m ?? 1) - 1]}`;
}

function brDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export function scheduleHeadline(f: PayoutAutoForecast, brl: (c: number) => string, partnerView: boolean): { title: string; value: string; caption: string; tone: "ok" | "muted" | "warn" } {
  const title = "Próximo repasse automático";
  if (f.recipient_missing || f.recipient_status !== "active") {
    return { title, value: "-", caption: partnerView ? "Seu cadastro de recebimento ainda não está completo. Sem ele, nada cai na conta." : "Recebedor inativo ou ausente no gateway: o repasse não sai.", tone: "warn" };
  }
  if (!f.enabled) {
    return { title, value: "-", caption: partnerView ? "O repasse automático não está ligado para você: fale com a Movepark." : `Repasse automático desligado para esta empresa${f.source === "company" ? " (configuração da empresa)" : " (padrão global)"}.`, tone: "muted" };
  }
  if (f.below_min) {
    return { title, value: brl(f.forecast_cents), caption: `Dia ${diaMes(f.next_at)}. Ficou abaixo de ${brl(f.min_cents)}, então acumula para o mês seguinte, sem taxa.`, tone: "muted" };
  }
  return { title, value: brl(f.forecast_cents), caption: `Cai no dia ${diaMes(f.next_at)}, sem taxa para você. O valor é a previsão de hoje: vendas que liberarem até lá entram.`, tone: "ok" };
}

export function lastCycleLabel(f: PayoutAutoForecast, brl: (c: number) => string): string | null {
  const c = f.last_cycle;
  if (!c) return null;
  const quando = brDate(c.ran_at);
  if (c.outcome === "paid") return `Último repasse automático em ${quando}: ${brl(c.amount_cents ?? 0)} enviados ao banco.`;
  if (c.outcome === "below_min") return `Em ${quando} não saiu: ${brl(c.available_cents ?? 0)} disponíveis, abaixo do mínimo. Acumula.`;
  if (c.outcome === "no_balance") return `Em ${quando} não saiu: o saldo no gateway não cobria o disponível.`;
  if (c.outcome === "running") return `Repasse de ${quando} em andamento.`;
  return `Em ${quando} o repasse falhou${c.reason ? `: ${c.reason}` : "."}`;
}

export function manualWithdrawCaption(feeCents: number, day: number, brl: (c: number) => string): string {
  return `Saque manual: a Pagar.me cobra ${brl(feeCents)} do seu saldo. O repasse automático do dia ${day} não tem taxa para você.`;
}
