// Contato do pagador exigido na cobrança (telefone). Edge (Deno).
//
// Regra única, usada nos dois lados do fluxo:
//   - GATE do pagamento (create-pix-charge, create-fare-upgrade, change-booking-dates-paid), que
//     precisa de { ddd, number } separados para o Pagar.me;
//   - ESCRITA (MCP/agente, que não passa pelo formulário do site), que só precisa do booleano.
// A escrita valida com a MESMA regra do gate de propósito: mais frouxa gravaria dado que o
// pagamento recusa depois; mais estrita recusaria telefone que o pagamento aceitaria.
//
// Não confunda com `toWhatsAppNumber` (`_shared/whatsapp.ts`): lá o destino é a Cloud API da Meta,
// que quer uma string única `55DDDNUMERO` e por isso ACRESCENTA o DDI 55 quando falta e exige >= 12
// dígitos. Aqui é o oposto: o Pagar.me quer o número sem DDI, em campos separados, então o 55 é
// removido. Propósitos opostos, regras opostas - não unifique.

/** Só os dígitos. */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Telefone (E.164 ou mascarado) → { ddd, number } ou null.
 *
 * Recusa menos de 10 dígitos (fixo sem DDD, celular sem DDD). O DDI 55 só cai quando o número tem
 * mais de 11 dígitos: sem essa guarda, um celular do DDD 55 (`55987654321`) perderia o próprio DDD.
 * `number` vai até 11 dígitos porque é o teto do campo no gateway.
 */
export function parseBrPhone(
  value: string | null | undefined,
): { ddd: string; number: string } | null {
  let digits = phoneDigits(value);
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.length < 10) return null;
  return { ddd: digits.slice(0, 2), number: digits.slice(2, 13) };
}

/** Telefone brasileiro com DDD: o que o gate de pagamento consegue usar, nada mais. */
export function isValidPhoneBr(value: string | null | undefined): boolean {
  return parseBrPhone(value) !== null;
}
