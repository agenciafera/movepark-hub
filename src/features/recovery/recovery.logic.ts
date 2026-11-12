/**
 * Reservas não concluídas que ainda dá para recuperar (12/11/2026).
 *
 * A lista vem pronta do servidor (`operator_recoverable_bookings`): só expiradas com entrada no
 * futuro, uma linha por pessoa, sem quem comprou depois. Aqui fica só a apresentação: rótulo de
 * origem, de "onde parou", telefone legível e as linhas do CSV. Ver docs/specs/booking-flow.md
 * (seção "Recuperável") e docs/specs/operator-panel.md.
 */
import { formatDateTime } from "@/lib/format";
import { csvMoney } from "@/lib/csv";

export type RecoverableBooking = {
  booking_id: string;
  code: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  location_name: string | null;
  parking_type: string | null;
  check_in_at: string;
  check_out_at: string;
  days: number | null;
  total_amount: number | null;
  attempts: number;
  origin: string | null;
  stopped_at: string;
  created_at: string;
};

/** Onde a pessoa parou, como a RPC deriva (`stopped_at`). */
export const STOPPED_AT_LABEL: Record<string, string> = {
  dados: "Antes de preencher os dados",
  veiculo: "Antes de informar o veículo",
  pagamento: "Na hora de pagar",
  pix: "PIX gerado e não pago",
  cartao: "Cartão não aprovado",
};

export function stoppedAtLabel(v: string): string {
  return STOPPED_AT_LABEL[v] ?? v;
}

/**
 * A Mia (agente de WhatsApp) não aborda quem abandona. Quem começou a reserva com ela já teve
 * uma conversa, e o parceiro precisa saber disso antes de ligar.
 */
export function talkedToMia(origin: string | null | undefined): boolean {
  return origin === "whatsapp-bot";
}

/** Origem curta, no vocabulário do parceiro: site, Mia ou página do destino. */
export function recoveryOriginLabel(origin: string | null | undefined): string {
  switch (origin) {
    case "whatsapp-bot":
      return "Mia no WhatsApp";
    case "mcp":
      return "Mia (agente)";
    case "webchat-bot":
      return "Assistente do site";
    case "hub_destino":
      return "Página do destino";
    case "api":
      return "API de parceiro";
    case null:
    case undefined:
    case "":
      return "Site";
    default:
      return origin.startsWith("hub") ? "Site" : origin;
  }
}

/** Só os dígitos do celular brasileiro, sem o DDI: o que a pessoa digitaria para ligar. */
function nationalDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  // Com "+" e outro DDI, é número de fora: não vira DDD brasileiro.
  if (raw.trim().startsWith("+") && !d.startsWith("55")) return null;
  return /^55\d{10,11}$/.test(d) ? d.slice(2) : d;
}

/** "+55 (11) 98765-4321" ou "11987654321" → "(11) 98765-4321". Fora do padrão, devolve como veio. */
export function formatRecoveryPhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const d = nationalDigits(raw);
  const m = d ? /^(\d{2})(\d{4,5})(\d{4})$/.exec(d) : null;
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : raw.trim();
}

/** Link do WhatsApp para o número, ou null quando ele não parece um celular brasileiro. */
export function whatsappLink(raw: string | null | undefined): string | null {
  const d = nationalDigits(raw);
  return d && /^\d{2}9\d{8}$/.test(d) ? `https://wa.me/55${d}` : null;
}

export const RECOVERY_CSV_HEADERS = [
  "Nome",
  "Telefone",
  "E-mail",
  "Reserva",
  "Unidade",
  "Vaga",
  "Entrada",
  "Saída",
  "Diárias",
  "Valor (R$)",
  "Tentativas",
  "Origem",
  "Falou com a Mia",
  "Onde parou",
] as const;

/**
 * Nome e e-mail são digitados pelo cliente e o arquivo abre no Excel: um valor que começa com
 * `=`, `+`, `-` ou `@` vira fórmula. O apóstrofo na frente faz a planilha ler como texto.
 */
export function csvSafeText(v: string | null | undefined): string {
  if (!v) return "";
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

export function recoveryCsvRow(r: RecoverableBooking): Record<string, string> {
  return {
    Nome: csvSafeText(r.customer_name),
    Telefone: formatRecoveryPhone(r.customer_phone) ?? "",
    "E-mail": csvSafeText(r.customer_email),
    Reserva: r.code,
    Unidade: r.location_name ?? "",
    Vaga: r.parking_type ?? "",
    Entrada: formatDateTime(r.check_in_at),
    Saída: formatDateTime(r.check_out_at),
    Diárias: r.days === null ? "" : String(r.days),
    "Valor (R$)": csvMoney(r.total_amount),
    Tentativas: String(r.attempts),
    Origem: recoveryOriginLabel(r.origin),
    "Falou com a Mia": talkedToMia(r.origin) ? "Sim" : "Não",
    "Onde parou": stoppedAtLabel(r.stopped_at),
  };
}
