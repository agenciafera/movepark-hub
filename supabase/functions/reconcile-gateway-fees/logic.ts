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

/**
 * Recuo entre tentativas. O filtro original ignorava `gateway_fee_synced_at`, e as mesmas cobranças
 * sem recebível eram reconsultadas a cada volta do cron (30 min), enquanto as demais nunca entravam
 * no lote (varredura de 15/09/2026: 190 execuções, uns 4.750 GET /payables inúteis).
 */
const RECUO_HORAS = 6;

/** Só entra no lote quem nunca foi tentado ou foi tentado antes deste instante. */
export function feeRetryCutoffIso(nowMs: number): string {
  return new Date(nowMs - RECUO_HORAS * 60 * 60_000).toISOString();
}
