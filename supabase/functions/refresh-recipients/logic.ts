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
