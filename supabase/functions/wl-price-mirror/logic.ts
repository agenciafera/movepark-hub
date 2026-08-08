/**
 * Decisões puras do job de espelhamento (E0.13), separadas para teste sem rede nem banco.
 */

/** Durações reamostradas na verificação diferencial, uma por faixa mais as bordas. */
export const VERIFY_DURATIONS = [1, 3, 6, 7, 15] as const;

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

/** Compara em centavos: comparar float faria 161.1 e 161.10000000000002 divergirem. */
export function pricesDiffer(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return Math.round(a * 100) !== Math.round(b * 100);
}
