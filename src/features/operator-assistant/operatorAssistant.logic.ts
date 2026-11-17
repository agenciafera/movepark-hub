// Lógica pura da bolinha da Mia para operadores. Ver docs/specs/assistente-do-operador.md.

export type PapelDaFala = "user" | "assistant" | "system";

export interface Fala {
  id: string;
  role: PapelDaFala;
  text: string;
  actionIds: string[];
}

export type StatusDaAcao = "proposed" | "executing" | "executed" | "failed" | "expired" | "dismissed";

export interface CartaoDeAcao {
  id: string;
  kind: string;
  summary: string;
  effect_cents: number | null;
  status: StatusDaAcao;
  expires_at: string;
  result: { resumo?: string; pix?: { copia_e_cola?: string | null; vence_em?: string | null } } | null;
  error: string | null;
  booking_code: string | null;
}

/** O código da reserva aberta na tela, para a Mia já saber de qual se fala. */
export function codigoDaPagina(pathname: string): string | null {
  const m = pathname.match(/^\/operator\/bookings\/(MP-[A-Z0-9]{4,12})\/?$/i);
  return m ? m[1].toUpperCase() : null;
}

const reais = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");

/** O dinheiro da ação, no sentido do cliente. */
export function rotuloDoEfeito(effectCents: number | null): string {
  if (effectCents == null || effectCents === 0) return "Sem dinheiro envolvido";
  return effectCents < 0 ? `Estorno de ${reais(-effectCents)} ao cliente` : `Cliente paga ${reais(effectCents)} por PIX`;
}

const ROTULO_DA_ACAO: Record<string, string> = {
  cancel: "Cancelar reserva",
  change_dates: "Alterar datas",
  change_vehicle: "Trocar veículo",
  check_in: "Registrar entrada",
  check_out: "Registrar saída",
};

export function rotuloDaAcao(kind: string): string {
  return ROTULO_DA_ACAO[kind] ?? "Ação";
}

/** Proposta ainda confirmável: viva e dentro dos 10 minutos. */
export function podeConfirmar(c: CartaoDeAcao, agora: Date): boolean {
  return c.status === "proposed" && new Date(c.expires_at).getTime() > agora.getTime();
}

/** O que o cartão diz sobre o próprio estado, quando não há mais botão. */
export function rotuloDoStatus(c: CartaoDeAcao, agora: Date): string | null {
  if (c.status === "proposed") return podeConfirmar(c, agora) ? null : "Proposta vencida. Peça de novo à Mia.";
  if (c.status === "executing") return "Fazendo…";
  if (c.status === "executed") return c.result?.resumo ?? "Feito.";
  if (c.status === "failed") return c.result?.resumo ?? `Não foi feito: ${c.error ?? "erro"}`;
  if (c.status === "dismissed") return "Descartada.";
  return "Proposta vencida.";
}

/** Atalhos de pergunta para a primeira conversa. Na tela de uma reserva, a primeira é sobre ela. */
export function sugestoes(codigo: string | null): string[] {
  const gerais = [
    "O cliente vai voltar 2 dias antes. Ele recebe as diárias de volta?",
    "Quando cai o estorno no cartão?",
    "O cliente da Básica quer mudar a data. O que eu faço?",
  ];
  return codigo ? [`O que dá para fazer na reserva ${codigo}?`, ...gerais.slice(0, 2)] : gerais;
}

/** Junta os cartões que chegaram com o que já estava na tela, sem duplicar. */
export function juntarCartoes(atuais: Record<string, CartaoDeAcao>, novos: CartaoDeAcao[]): Record<string, CartaoDeAcao> {
  const out = { ...atuais };
  for (const c of novos) out[c.id] = c;
  return out;
}
