import type { PayoutBalance } from "./api";

/**
 * O card de saldo da tela do parceiro, decidido fora do JSX.
 *
 * Existem dois potes, e qual deles importa depende do modo de split da venda:
 *
 * - **Custódia** (hoje): a cobrança inteira cai na Movepark, que deve ao parceiro. O número que
 *   importa é a dívida, `balance_cents`.
 * - **Split ligado**: o gateway credita o parceiro direto, a dívida da Movepark é zero e a tela
 *   diria "Saldo a receber R$ 0,00" para quem acabou de vender. O número que importa passa a ser o
 *   que o gateway creditou.
 *
 * A regra é mecânica: se o gateway creditou alguma coisa, o card fala do crédito; senão, fala da
 * dívida, exatamente como antes. Enquanto a custódia estiver ligada, `gateway_credited_cents` é
 * zero e nada muda na tela.
 */
export type ResumoSaldo = {
  titulo: string;
  valorCents: number;
  linhas: { rotulo: string; valorCents: number }[];
};

export function resumoSaldo(b: Partial<PayoutBalance> | null | undefined): ResumoSaldo {
  const creditado = b?.gateway_credited_cents ?? 0;
  const divida = b?.balance_cents ?? 0;
  const repassado = b?.transferred_cents ?? 0;
  const sacado = b?.withdrawn_cents ?? 0;

  if (creditado <= 0) {
    return {
      titulo: "Saldo a receber",
      valorCents: divida,
      // Dois movimentos do mesmo dinheiro: a Movepark repassa para o recebedor do parceiro, e o
      // parceiro saca para o banco dele. "já transferido" sozinho não dizia qual dos dois.
      linhas: [
        { rotulo: "repassado pela Movepark", valorCents: repassado },
        { rotulo: "sacado por você", valorCents: sacado },
      ],
    };
  }

  // O título fala de CRÉDITO ACUMULADO, não de saldo parado no recebedor, e a diferença é
  // deliberada: `payout_withdrawal` só é alimentada pelo webhook `transfer.*`, que nunca chegou
  // nesta conta, e recebedor com transferência automática (a Virapark é mensal, dia 10) manda o
  // dinheiro para o banco sem passar por nós. Dizer "no seu recebedor" afirmaria um saldo que não
  // lemos. O que a Movepark consegue provar com os próprios registros é quanto o gateway creditou.
  const linhas: { rotulo: string; valorCents: number }[] = [];
  if (divida > 0) linhas.push({ rotulo: "a receber da Movepark", valorCents: divida });
  if (repassado > 0) linhas.push({ rotulo: "repassado pela Movepark", valorCents: repassado });
  if (sacado > 0) linhas.push({ rotulo: "sacado por você", valorCents: sacado });

  return { titulo: "Creditado pelo gateway", valorCents: creditado, linhas };
}
