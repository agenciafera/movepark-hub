// Validação de documentos brasileiros (dígitos verificadores). pt-BR.
// Recebe valor cru ou mascarado — normaliza para dígitos antes de validar.

import { onlyDigits } from "./masks";

/** Valida CPF pelos dígitos verificadores (rejeita sequências repetidas). */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calc = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

/** Valida CNPJ pelos dígitos verificadores (rejeita sequências repetidas). */
export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (len: number): number => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/** CEP brasileiro: 8 dígitos. */
export function isValidCep(value: string): boolean {
  return onlyDigits(value).length === 8;
}

/** Telefone BR com DDD: 10 (fixo) ou 11 (celular) dígitos. */
export function isValidPhoneBR(value: string): boolean {
  const n = onlyDigits(value).length;
  return n === 10 || n === 11;
}

/**
 * Data no formato DD/MM/AAAA, calendário válido e não no futuro.
 * Usada para nascimento do representante.
 */
export function isValidPastDateBR(value: string): boolean {
  const v = onlyDigits(value);
  if (v.length !== 8) return false;
  const day = Number(v.slice(0, 2));
  const month = Number(v.slice(2, 4));
  const year = Number(v.slice(4, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (year < 1900) return false;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return false;
  return d.getTime() <= Date.now();
}
