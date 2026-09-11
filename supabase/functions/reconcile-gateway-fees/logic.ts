// Lógica pura de reconcile-gateway-fees (testável sem rede): a janela da varredura.

/** Cada item do lote é uma chamada ao gateway, e `/payables` tem rate limit. */
export const BATCH_LIMIT = 25;

/** O recebível não nasce junto com o `charge.paid`; consultar antes disso volta vazio. */
const ATRASO_MINUTOS = 10;

/**
 * Cobrança que nunca gerou recebível (caso raro, mas existe) seria reconsultada para sempre, já
 * que o filtro é `gateway_fee_cents is null`. O fundo da janela encerra a tentativa.
 */
const FUNDO_DIAS = 90;

/** Janela de `paid_at` que a varredura considera. */
export function feeWindowIso(nowMs: number): { since: string; until: string } {
  return {
    since: new Date(nowMs - FUNDO_DIAS * 24 * 60 * 60_000).toISOString(),
    until: new Date(nowMs - ATRASO_MINUTOS * 60_000).toISOString(),
  };
}
