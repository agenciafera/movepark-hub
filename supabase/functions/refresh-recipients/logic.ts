import type { RecipientResult } from "../_shared/payments/types.ts";

/**
 * Decisões puras do poll de recebedores.
 *
 * Esta rotina mexe na ficha que diz para onde o dinheiro do parceiro vai. Errar aqui
 * não gera erro na tela: gera repasse silencioso para a conta errada, ou um parceiro
 * congelado em análise sem ninguém saber por quê. Por isso as três decisões abaixo
 * saíram do laço e ganharam teste.
 */

/** Status que ainda podem mudar no gateway. `active` e `refused` são terminais. */
export const REFRESHABLE = ["pending", "action_required"] as const;

/**
 * Recuo da leitura de saldo. O cron roda a cada 15 min por causa da ficha em análise, mas saldo não
 * muda nesse ritmo e cada recebedor ativo é uma chamada. Uma hora é o suficiente para a tela dele
 * não ficar velha e para a conta de chamadas não crescer à toa.
 */
export const BALANCE_TTL_MINUTES = 60;

export function saldoVencido(syncedAt: string | null | undefined, nowMs: number): boolean {
  if (!syncedAt) return true;
  const t = Date.parse(syncedAt);
  if (!Number.isFinite(t)) return true;
  return nowMs - t >= BALANCE_TTL_MINUTES * 60_000;
}

/**
 * Quando vale a pena perguntar se o recebedor existe, depois de o saldo falhar.
 *
 * 404 na rota de saldo tem duas leituras muito diferentes, e a tela do parceiro depende de saber
 * qual: ou o recebedor não existe para a chave atual (id de outra conta, ou apagado), ou existe e
 * só não tem movimento nenhum. Uma é problema grave de configuração, a outra é normal. Uma chamada
 * a `GET /recipients/{id}` separa as duas, e ela só acontece nesse caso.
 */
export function precisaSondarRecebedor(httpStatus: number | null): boolean {
  return httpStatus === 404;
}

export type PatchSaldo = {
  balance_available_cents: number;
  balance_waiting_cents: number;
  balance_transferred_cents: number;
  balance_synced_at: string;
};

/**
 * O que gravar depois de ler `GET /recipients/{id}/balance`, ou `null` para não gravar nada.
 *
 * Resposta ruim não vira zero. Um 401 de allowlist de IP ou um 500 do gateway escreveriam
 * "disponível R$ 0,00" com carimbo de agora, e o parceiro leria isso como o dinheiro tendo sumido.
 * Sem leitura boa, a tela continua mostrando a foto anterior, com a data antiga, que é honesto.
 */
export function decidirSaldo(
  r: {
    httpStatus: number | null;
    availableCents: number | null;
    waitingFundsCents: number | null;
    transferredCents: number | null;
  },
  nowIso: string,
): PatchSaldo | null {
  const http = r.httpStatus ?? 0;
  if (http < 200 || http >= 300) return null;
  // Os três nulos ao mesmo tempo significam corpo em outro formato, não conta zerada.
  if (r.availableCents === null && r.waitingFundsCents === null && r.transferredCents === null) {
    return null;
  }
  return {
    balance_available_cents: r.availableCents ?? 0,
    balance_waiting_cents: r.waitingFundsCents ?? 0,
    balance_transferred_cents: r.transferredCents ?? 0,
    balance_synced_at: nowIso,
  };
}

export function ehAtualizavel(status: string): boolean {
  return (REFRESHABLE as readonly string[]).includes(status);
}

/**
 * Portão da chave interna. A rotina é chamada pelo pg_cron via pg_net, então a única
 * barreira é o header. Falha fechada quando a variável não está configurada: uma
 * função de repasse aberta por falta de config é pior do que uma que não roda.
 */
export function autorizado(
  esperado: string | undefined,
  recebido: string | null,
): boolean {
  if (!esperado) return false;
  return recebido === esperado;
}

export type Decisao =
  | { tipo: "so_evento"; recipientId: string; httpStatus: number | null; response: unknown }
  | {
      tipo: "atualizar";
      recipientId: string;
      patch: {
        status: string;
        last_provider_status: string | null;
        requirements: unknown;
      };
      mudouStatus: boolean;
      httpStatus: number | null;
      response: unknown;
    };

/**
 * Traduz a resposta do gateway em uma decisão, sempre carregando o `recipientId` da
 * linha que foi consultada.
 *
 * O id anda junto de propósito. É ele que amarra o patch à ficha certa: se a
 * atualização caísse na linha errada, o parceiro A passaria a receber com os dados de
 * B, e nada na tela denunciaria.
 *
 * O patch NÃO inclui `kyc_url` nem `kyc_url_expires_at`. Este poll não emite link
 * (`kycLink: false`), então não tem nada novo para gravar, e escrever null apagaria o
 * link vivo que o parceiro abriu no celular, no meio da prova de vida.
 */
export function decidir(
  rec: { id: string; status: string },
  result: Pick<
    RecipientResult,
    "externalId" | "status" | "rawStatus" | "requirements" | "raw" | "httpStatus"
  >,
): Decisao {
  // Sem id o gateway não respondeu o que devia (ex.: 401 de allowlist de IP). Mexer no
  // status aqui congelaria ou liberaria a ficha por causa de uma falha de rede.
  if (!result.externalId) {
    return {
      tipo: "so_evento",
      recipientId: rec.id,
      httpStatus: result.httpStatus ?? null,
      response: result.raw,
    };
  }
  return {
    tipo: "atualizar",
    recipientId: rec.id,
    patch: {
      status: result.status,
      last_provider_status: result.rawStatus,
      requirements: result.requirements,
    },
    mudouStatus: result.status !== rec.status,
    httpStatus: result.httpStatus ?? null,
    response: result.raw,
  };
}
