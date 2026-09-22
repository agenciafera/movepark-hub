// Máscaras de formatação para inputs (somente apresentação — guarde sempre os dígitos crus).
// pt-BR. Usadas no KYC do recebedor (CNPJ/CPF, CEP, telefone, data) e formulários do parceiro.

/** Remove tudo que não é dígito. */
export function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/** 00.000.000/0000-00 (CNPJ, 14 dígitos). */
export function cnpjMask(value: string): string {
  const v = onlyDigits(value).slice(0, 14);
  return v
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** 000.000.000-00 (CPF, 11 dígitos). */
export function cpfMask(value: string): string {
  const v = onlyDigits(value).slice(0, 11);
  return v
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** Máscara dinâmica de documento: CPF (≤11 dígitos) ou CNPJ (>11). */
export function documentMask(value: string): string {
  return onlyDigits(value).length > 11 ? cnpjMask(value) : cpfMask(value);
}

/** 00000-000 (CEP, 8 dígitos). */
export function cepMask(value: string): string {
  const v = onlyDigits(value).slice(0, 8);
  if (v.length <= 5) return v;
  return `${v.slice(0, 5)}-${v.slice(5)}`;
}

/** (00) 00000-0000 / (00) 0000-0000 (telefone BR com DDD). */
export function phoneMask(value: string): string {
  const v = onlyDigits(value).slice(0, 11);
  if (v.length <= 2) return v.length ? `(${v}` : "";
  if (v.length <= 6) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  if (v.length <= 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
  return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
}

/** Quebra um telefone (mascarado ou cru) em DDD + número, como o Pagar.me espera. */
export function splitPhone(value: string): { ddd: string; number: string } {
  const v = onlyDigits(value).slice(0, 11);
  return { ddd: v.slice(0, 2), number: v.slice(2) };
}

/** DD/MM/AAAA (data, 8 dígitos). */
export function dateMask(value: string): string {
  const v = onlyDigits(value).slice(0, 8);
  if (v.length <= 2) return v;
  if (v.length <= 4) return `${v.slice(0, 2)}/${v.slice(2)}`;
  return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
}

/**
 * Validade do cartão, MM/AA: só dígitos, no máximo quatro, com a barra entrando sozinha. Mês que
 * começa em 2 a 9 ganha o zero na frente ("3" vira "03/"), porque não existe mês 3x.
 */
export function cardExpiryMask(value: string): string {
  let v = onlyDigits(value).slice(0, 4);
  if (v.length >= 1 && Number(v[0]) > 1) v = `0${v}`.slice(0, 4);
  if (v.length <= 2) return v;
  return `${v.slice(0, 2)}/${v.slice(2)}`;
}

/** DD/MM/AAAA → AAAA-MM-DD (ISO), ou null se incompleta/invalida no formato. */
export function brDateToIso(value: string): string | null {
  const v = onlyDigits(value);
  if (v.length !== 8) return null;
  const dd = v.slice(0, 2);
  const mm = v.slice(2, 4);
  const yyyy = v.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}

/** Placa BR: ABC-1D23 (Mercosul) ou ABC-1234 (antiga). 7 chars A-Z0-9, hífen só apresentação. */
export function plateMask(value: string): string {
  const v = (value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 7);
  if (v.length <= 3) return v;
  return `${v.slice(0, 3)}-${v.slice(3)}`;
}

/** Número do cartão em grupos de 4 ("4111 1111 1111 1111"); Amex tem 15 dígitos e vai 4-6-5. */
export function cardNumberMask(value: string): string {
  const v = onlyDigits(value).slice(0, 19);
  if (/^3[47]/.test(v)) {
    return [v.slice(0, 4), v.slice(4, 10), v.slice(10, 15)].filter(Boolean).join(" ");
  }
  return v.replace(/(\d{4})(?=\d)/g, "$1 ");
}
