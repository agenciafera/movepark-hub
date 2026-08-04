/**
 * Leitura do campo de validade do cartão. Regra única do projeto: vale para o
 * cartão salvo da conta e para o cartão do checkout.
 */

export type Validade = { mes: number; ano: number };

/**
 * Interpreta a validade digitada, em "MM/AA" ou "MMAA": o campo da conta tem
 * máscara e põe a barra, o do checkout não tem e aceita os quatro dígitos secos.
 * Devolve `null` quando a validade não serve: formato fora desses dois, mês fora
 * de 1 a 12, ou validade que já passou.
 *
 * O cartão vale até o último dia do mês impresso, então o mês corrente é aceito.
 */
export function parseValidade(expiry: string, agora: Date): Validade | null {
  // Casa o formato inteiro, em vez de partir na barra: "11/2029" precisa ser
  // recusado, e não virar o ano 4029.
  const campos = expiry.replace(/\s/g, "").match(/^(\d{2})\/?(\d{2})$/);
  if (!campos) return null;

  const mes = parseInt(campos[1], 10);
  if (mes < 1 || mes > 12) return null;

  const ano = 2000 + parseInt(campos[2], 10);
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;
  if (ano < anoAtual || (ano === anoAtual && mes < mesAtual)) return null;

  return { mes, ano };
}
