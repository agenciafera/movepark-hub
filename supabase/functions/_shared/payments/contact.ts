// Contato do pagador exigido na cobrança (telefone). Edge (Deno).
//
// O PIX do Pagar.me exige telefone com DDD, e hoje a mesma regra está reimplementada como
// `parseBrPhone` em create-pix-charge/logic.ts, create-fare-upgrade/logic.ts e
// change-booking-dates-paid/logic.ts. Esta é a versão compartilhada, usada na ESCRITA (MCP/agente,
// que não passa pelo formulário do site). A consolidação das três cópias é tarefa própria.

/** Só os dígitos. */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Telefone brasileiro com DDD: 10 dígitos (fixo) ou 11 (celular), aceitando o DDI 55 na frente.
 * Mesma regra do gate de pagamento (`parseBrPhone`), que recusa menos de 10 dígitos.
 */
export function isValidPhoneBr(value: string | null | undefined): boolean {
  let d = phoneDigits(value);
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d.length === 10 || d.length === 11;
}
