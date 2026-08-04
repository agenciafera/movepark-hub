/** Leitura do campo de validade do cartão, separada do componente para ter teste próprio. */

export type Validade = { mes: number; ano: number };

/**
 * Interpreta o "MM/AA" digitado. Devolve `null` quando a validade não serve:
 * mês fora de 1 a 12, ano vazio ou validade que já passou.
 *
 * O cartão vale até o último dia do mês impresso, então o mês corrente é aceito.
 */
export function parseValidade(expiry: string, agora: Date): Validade | null {
  const [mm, yy] = expiry.split("/");
  const mes = parseInt(mm ?? "", 10);
  const ano2 = parseInt(yy ?? "", 10);
  if (!mes || mes < 1 || mes > 12 || !ano2) return null;

  const ano = 2000 + ano2;
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;
  if (ano < anoAtual || (ano === anoAtual && mes < mesAtual)) return null;

  return { mes, ano };
}
