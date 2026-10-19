// Trava de cobrança por reserva (19/10/2026, depois da MP-07DAE9). Ver a migration
// 20261130100000_payment_charge_lock.sql.
//
// `create-card-charge` e `create-pix-charge` reivindicam a trava ANTES de conferir se a reserva já
// foi paga e de chamar o gateway, e soltam no fim (sucesso ou erro). Duas chamadas simultâneas da
// mesma reserva (clique duplo, aba duplicada, cartão e PIX ao mesmo tempo): só a primeira cobra.

export interface ChargeLock {
  /** false = outra cobrança desta reserva está em andamento; não cobrar. */
  acquired: boolean;
  /** Solta a trava. Nunca lança; sem trava (ou já solta) não faz nada. */
  release(): Promise<void>;
}

/** Prazo da trava. A Edge morre em 150 s; a trava não pode sobreviver muito além disso. */
export const CHARGE_LOCK_TTL_SECONDS = 120;

export async function claimChargeLock(
  // deno-lint-ignore no-explicit-any
  admin: any,
  bookingId: string,
  ttlSeconds = CHARGE_LOCK_TTL_SECONDS,
): Promise<ChargeLock> {
  const { data, error } = await admin.rpc("payment_charge_lock_claim", {
    p_booking_id: bookingId,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) {
    // Sem a trava, segue como era antes dela: recusar aqui pararia toda venda por um erro de
    // leitura. Fica no log para aparecer se virar padrão.
    console.error("[charge-lock] não consegui reivindicar a trava, seguindo sem ela:", bookingId, error.message);
    return { acquired: true, release: async () => {} };
  }
  const token = typeof data === "string" && data ? data : null;
  if (!token) return { acquired: false, release: async () => {} };

  let released = false;
  return {
    acquired: true,
    release: async () => {
      if (released) return;
      released = true;
      try {
        const { error: relErr } = await admin.rpc("payment_charge_lock_release", {
          p_booking_id: bookingId,
          p_token: token,
        });
        if (relErr) console.error("[charge-lock] não consegui soltar a trava:", bookingId, relErr.message);
      } catch (e) {
        console.error("[charge-lock] não consegui soltar a trava:", bookingId, e);
      }
    },
  };
}

/** Mensagem para quem tenta cobrar com outra cobrança da mesma reserva em andamento. */
export const CHARGE_IN_PROGRESS_MESSAGE =
  "Já tem um pagamento desta reserva em andamento. Aguarde alguns segundos antes de tentar de novo.";
