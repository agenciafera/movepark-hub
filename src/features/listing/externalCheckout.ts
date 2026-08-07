/**
 * Link de saída para o checkout do parceiro (E0.15, sobre a base da E0.14).
 *
 * A URL base vem PRONTA do servidor (`external_checkout_url`, campo computado do PostgREST),
 * já com a marcação de afiliado. Aqui o front só ACRESCENTA o contexto da busca no fim.
 *
 * Acrescentar é seguro; remontar a query no cliente é proibido. É assim que a marcação de
 * afiliado some sem ninguém notar, e ela é a diferença entre 17% e 9% de participação naquela
 * venda. Por isso a concatenação é literal, sem passar por `new URL()` nem `URLSearchParams`:
 * nada reescreve o que já veio.
 */

/** Nome dos parâmetros aceitos pelo white-label. Confirmado com o parceiro em 05/08/2026. */
const START_PARAM = "startDateTime";
const END_PARAM = "endDateTime";

/**
 * Acrescenta as datas da busca à URL de saída.
 *
 * Sem as datas o cliente recomeça a seleção no site do parceiro, e a desistência acontece
 * bem no ponto de saída.
 *
 * **Formato:** ISO 8601 em UTC com milissegundos (`2026-08-12T16:00:00.000Z`), com os
 * dois-pontos percent-encoded.
 *
 * **Fuso:** usa o mesmo `toISOString()` que o resto do fluxo de reserva usa para montar
 * `check_in_at`/`check_out_at`. É deliberado: o link precisa carregar o MESMO instante que o
 * Hub reservaria, senão a nossa página mostra um horário e o parceiro abre outro. Se um dia o
 * fluxo passar a interpretar a data no fuso da unidade em vez do fuso do navegador, esta
 * função acompanha, porque lê o mesmo `Date`.
 *
 * Só acrescenta quando as duas datas existem: mandar só a entrada deixaria o parceiro com
 * meia seleção, que é pior que nenhuma.
 */
export function withSearchDates(
  baseUrl: string | null | undefined,
  from: Date | null | undefined,
  to: Date | null | undefined,
): string | null {
  if (!baseUrl) return null;
  if (!isValidDate(from) || !isValidDate(to)) return baseUrl;

  const sep = baseUrl.includes("?") ? "&" : "?";
  return (
    baseUrl +
    sep +
    START_PARAM + "=" + encodeURIComponent(from.toISOString()) +
    "&" + END_PARAM + "=" + encodeURIComponent(to.toISOString())
  );
}

function isValidDate(d: Date | null | undefined): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}
