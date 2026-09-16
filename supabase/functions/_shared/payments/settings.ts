// As chaves do gateway em `app_setting`, lidas de um lugar só. Cada Edge fazia a própria leitura
// e a própria conversão; com o split dinâmico entram mais duas (colchão do master e o recebedor
// master no estorno), e repetir isso em oito lugares é convite a divergir.

import { isGatewaySplitEnabled } from "./split.ts";

export interface GatewaySettings {
  /** Recebedor master da Movepark (`pagarme_movepark_recipient_id`), ou "" se não configurado. */
  moveparkRecipientId: string;
  /** O split vai ao gateway (`pagarme_split_enabled`)? Default ligado. */
  splitEnabled: boolean;
  /** Piso de saldo no master para honrar estornos (`pagarme_master_float_cents`). Zero = sem piso. */
  masterFloatCents: number;
  /**
   * Estorno híbrido (E0.3.6, `pagarme_refund_hybrid_enabled`): o gateway debita o parceiro quando
   * o saldo disponível dele cobre o líquido que recebeu. Default DESLIGADO: nasce inerte e só
   * liga depois de um teste.
   */
  refundHybridEnabled: boolean;
  /** Chaves cruas, para quem precisar de outra (ex.: `card_installment_policy`). */
  raw: Record<string, string | null>;
}

export const GATEWAY_SETTING_KEYS = [
  "pagarme_movepark_recipient_id",
  "pagarme_split_enabled",
  "pagarme_master_float_cents",
  "pagarme_refund_hybrid_enabled",
] as const;

/** Converte as linhas de `app_setting` já lidas. Pura, para teste. */
export function parseGatewaySettings(
  rows: { key: string; value: string | null }[] | null | undefined,
): GatewaySettings {
  const raw = Object.fromEntries((rows ?? []).map((s) => [s.key, s.value]));
  const float = Number(raw.pagarme_master_float_cents ?? 0);
  return {
    moveparkRecipientId: (raw.pagarme_movepark_recipient_id ?? "").trim(),
    splitEnabled: isGatewaySplitEnabled(raw.pagarme_split_enabled),
    masterFloatCents: Number.isFinite(float) && float > 0 ? Math.round(float) : 0,
    refundHybridEnabled: (raw.pagarme_refund_hybrid_enabled ?? "false").trim().toLowerCase() === "true",
    raw,
  };
}

/** Lê `app_setting` com o client admin. `extraKeys` entra em `raw`. */
// deno-lint-ignore no-explicit-any
export async function loadGatewaySettings(admin: any, extraKeys: string[] = []): Promise<GatewaySettings> {
  const { data } = await admin
    .from("app_setting")
    .select("key, value")
    .in("key", [...GATEWAY_SETTING_KEYS, ...extraKeys]);
  return parseGatewaySettings(data as { key: string; value: string | null }[] | null);
}
