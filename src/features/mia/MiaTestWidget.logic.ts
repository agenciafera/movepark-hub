import type { IdentidadeSimulada, OrigemDaMia } from "./api";

/** O número que a Edge usa quando ninguém escolhe. Não é de nenhum cliente. */
export const TELEFONE_PADRAO = "5500000000000";

/**
 * Só os dígitos, com o DDI 55 na frente quando quem digitou omitiu.
 *
 * Ninguém escreve "5541988149449" de cabeça: escreve "(41) 98814-9449". Exigir o DDI
 * transformaria a bancada de teste num formulário chato, e o erro apareceria como
 * "reserva não encontrada", que é a pior forma de dizer "faltou o 55".
 */
export function normalizarTelefone(bruto: string): string {
  const digitos = bruto.replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.startsWith("55")) return digitos;
  // 10 ou 11 dígitos é DDD + número sem DDI.
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

/**
 * O formato fecha? Mesma regra da Edge, de propósito.
 *
 * Aqui ela existe para dizer o problema enquanto a pessoa digita; lá ela existe porque
 * validação de cliente não é validação. As duas precisam concordar, senão o campo aceita
 * e o servidor recusa, que é a combinação que mais irrita.
 */
export function telefoneAceito(bruto: string): boolean {
  if (!bruto.trim()) return true; // vazio cai no padrão
  const d = normalizarTelefone(bruto);
  return d.startsWith("55") && d.length >= 12 && d.length <= 13;
}

/** A identidade final, pronta para ir à Edge. Vazio vira o número de ninguém. */
export function identidadeDe(telefone: string, origem: OrigemDaMia): IdentidadeSimulada {
  const normalizado = normalizarTelefone(telefone);
  return { telefone: normalizado || TELEFONE_PADRAO, origem };
}

/** Como o número aparece no cabeçalho: legível, e sem fingir que o padrão é alguém. */
export function rotuloDoTelefone(telefone: string): string {
  if (telefone === TELEFONE_PADRAO) return "sem cliente";
  const d = telefone.replace(/\D/g, "");
  if (d.length < 12) return telefone;
  const ddd = d.slice(2, 4);
  const numero = d.slice(4);
  const meio = numero.length === 9 ? 5 : 4;
  return `(${ddd}) ${numero.slice(0, meio)}-${numero.slice(meio)}`;
}
