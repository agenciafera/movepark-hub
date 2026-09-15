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
 *   que está no recebedor dele.
 *
 * A regra é mecânica: se o gateway creditou alguma coisa, o card fala do recebedor; senão, fala da
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

  // O recebedor é alimentado pelos dois caminhos: o split do gateway e o repasse da Movepark.
  // O que sobra lá é o que entrou menos o que o parceiro já levou para o banco.
  const noRecebedor = Math.max(creditado + repassado - sacado, 0);
  const linhas = [{ rotulo: "sacado por você", valorCents: sacado }];
  if (divida > 0) linhas.unshift({ rotulo: "a receber da Movepark", valorCents: divida });

  return { titulo: "No seu recebedor", valorCents: noRecebedor, linhas };
}
