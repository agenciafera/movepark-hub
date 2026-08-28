/**
 * Os caminhos públicos do catálogo, num lugar só.
 *
 * Uma gramática para as duas famílias de ficha: unidade parceira e lote mapeado moram no
 * mesmo `/estacionamentos/<destino>/<lote>`, com o slug público (`public_slug`) das duas
 * pontas. Foi o que permitiu reivindicar uma ficha sem trocar de endereço, e é o que tira
 * o tipo de vaga da URL (ele vira seleção dentro da página).
 *
 * Ver docs/specs/url-estacionamentos.md.
 */

/** Segmentos que a rota reserva dentro do destino: nenhum lote pode se chamar assim. */
export const SEGMENTOS_RESERVADOS = ["precos", "mais-barato"] as const;

/** `/estacionamentos/aeroporto-guarulhos` */
export function caminhoDestino(destino: string): string {
  return `/estacionamentos/${destino}`;
}

/** `/estacionamentos/aeroporto-guarulhos/aeropark` */
export function caminhoFicha(destino: string, lote: string): string {
  return `/estacionamentos/${destino}/${lote}`;
}

/** `/estacionamentos/aeroporto-guarulhos/precos` */
export function caminhoPrecos(destino: string): string {
  return `/estacionamentos/${destino}/precos`;
}

/** `/estacionamentos/aeroporto-guarulhos/mais-barato` */
export function caminhoMaisBarato(destino: string): string {
  return `/estacionamentos/${destino}/mais-barato`;
}

/**
 * O tipo de vaga escolhido dentro da ficha.
 *
 * Query em vez de segmento: o tipo não é uma página, é a oferta selecionada. O canonical
 * da ficha ignora a query, então as variações não viram URL concorrente no índice.
 */
export function caminhoFichaComVaga(destino: string, lote: string, vaga: string): string {
  return `${caminhoFicha(destino, lote)}?vaga=${encodeURIComponent(vaga)}`;
}

/** Âncora da seção do tipo de vaga, para link direto sem recarregar a ficha. */
export function ancoraVaga(vaga: string): string {
  return `#vaga-${vaga}`;
}
