// PRD-14 — Garantia de vaga. Cópia da marca (promessa de plataforma) e regra operacional.
// A garantia é da plataforma: como a disponibilidade é controlada em tempo real
// (ver capacity-rules), a Movepark não vende mais vagas do que cabem.

export const GUARANTEE_SHORT = "Vaga garantida";

export const GUARANTEE_PROMISE = "Vaga garantida ou realocamos e cobrimos a diferença.";

/** Regra operacional exibida na seção "Sobre a garantia" (parágrafos). */
export const GUARANTEE_POLICY: string[] = [
  "Reservou pela Movepark? A vaga é sua. Como a disponibilidade é controlada em tempo real, não vendemos mais vagas do que cabem.",
  "Se por algum imprevisto faltar vaga na chegada, a gente resolve: realocamos você em um parceiro próximo e cobrimos a diferença de preço, ou devolvemos 100% do valor + um crédito pelo transtorno.",
  "É só acionar pela sua reserva: o pedido fica registrado e abre o WhatsApp da Movepark com o código.",
];

import { EMAIL_SUPORTE, WHATSAPP_SUPORTE_DIGITOS } from "@/lib/suporte";

/**
 * Contato central de suporte, da fonte única (`@/lib/suporte`). Até 23/09/2026 o WhatsApp aqui
 * estava vazio e a garantia caía no WhatsApp do estacionamento que falhou: a Movepark nunca
 * ficava sabendo do acionamento.
 */
export const MOVEPARK_SUPPORT: { whatsapp: string; email: string } = {
  whatsapp: WHATSAPP_SUPORTE_DIGITOS,
  email: EMAIL_SUPORTE,
};

/** Mensagem pré-preenchida do acionamento (WhatsApp/e-mail). */
export function guaranteeClaimMessage(args: { code: string; unitName?: string | null }): string {
  const where = args.unitName ? ` em ${args.unitName}` : "";
  return `Olá! Cheguei${where} e estou sem vaga. Quero acionar a garantia da Movepark. Reserva: ${args.code}.`;
}
