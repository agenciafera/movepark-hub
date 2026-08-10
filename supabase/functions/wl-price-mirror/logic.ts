/**
 * Decisões puras do job de espelhamento (E0.13), separadas para teste sem rede nem banco.
 */

/** Durações reamostradas na verificação diferencial, uma por faixa mais as bordas. */
export const VERIFY_DURATIONS = [1, 3, 6, 7, 15] as const;

/**
 * As durações que fazem sentido conferir numa vaga com piso de estadia.
 *
 * Abaixo do piso o parceiro devolve 400, e comparar erro com preço marcaria divergência em toda
 * passada. Mantém-se o piso na lista (é a duração mais vendida numa tabela com mínimo) e
 * descartam-se as canônicas que caem abaixo dele.
 */
export function verifyDurations(minimumDays: number): number[] {
  const acima: number[] = VERIFY_DURATIONS.filter((d) => d >= minimumDays);
  return acima[0] === minimumDays ? acima : [minimumDays, ...acima];
}

/**
 * Data-âncora da amostragem.
 *
 * Fixa no futuro (30 dias à frente, meio-dia) por três motivos: data passada é recusada pelo
 * parceiro, data muito próxima pode cair em regra de antecedência, e meio-dia evita a virada
 * de diária mexer na conta enquanto a busca binária procura a tolerância.
 *
 * Amostrar numa âncora só assume que o parceiro não pratica preço sazonal. Se um dia praticar,
 * quem descobre é a verificação diferencial: os motores passam a divergir nas datas de fora da
 * âncora, a regra cai para `divergent` e a vitrine para de mostrar preço fechado.
 */
export function buildQuoteAnchor(now: Date): Date {
  const d = new Date(now.getTime() + 30 * 86_400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}

/**
 * Quanto tempo a função pode GASTAR antes de parar de pegar vaga nova.
 *
 * A Edge derruba a invocação depois de 150s sem escrever resposta, e o job só responde no fim.
 * Uma vaga custa uns 45s, então parar de começar aos 90s deixa a última caber (90 + 45 = 135)
 * com folga. Ao virar as cinco unidades externas de 10/08/2026 o job passou de 1 para 12 vagas
 * e tomou IDLE_TIMEOUT no meio, deixando 7 vagas com a tabela velha apontando para o parceiro.
 */
export const START_BUDGET_MS = 90_000;

/**
 * Ordena a fila pela vaga mais VELHA primeiro (nunca espelhada na frente de todas).
 *
 * É isso que faz o corte por tempo virar rodízio em vez de fome: o que sobrou de uma passada
 * está no topo da próxima, então toda vaga é alcançada mesmo quando a fila não cabe inteira.
 */
export function sortByStaleness<T>(rows: T[], verifiedAt: (row: T) => string | null): T[] {
  return [...rows].sort((a, b) => {
    const va = verifiedAt(a);
    const vb = verifiedAt(b);
    if (va === vb) return 0;
    if (va === null) return -1;
    if (vb === null) return 1;
    return va < vb ? -1 : 1;
  });
}

/** Compara em centavos: comparar float faria 161.1 e 161.10000000000002 divergirem. */
export function pricesDiffer(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return Math.round(a * 100) !== Math.round(b * 100);
}
