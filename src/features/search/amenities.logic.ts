/**
 * Amenidades que na verdade descrevem o TIPO de vaga, não a unidade (86ajmwawc).
 *
 * Estes códigos existem em `location_amenity` (nível da unidade) E em `parking_type`. Num contexto
 * por tipo (página da unidade, card por tipo de vaga), a amenidade descritora ou repete o tipo do
 * card ou o contradiz: a badge "Coberto" numa vaga "Descoberta", contradição na mesma caixa. O tipo
 * já diz o que ela diria, então ela sai desse contexto. Confirmado com o Claudio (22/07): estes
 * quatro são descritor de tipo; o resto (câmeras, portaria, transfer, etc.) é amenidade de verdade.
 */
export const TYPE_DESCRIPTOR_AMENITY_CODES = ["covered", "motorcycle", "valet", "self_park"] as const;

const DESCRIPTOR_SET = new Set<string>(TYPE_DESCRIPTOR_AMENITY_CODES);

/** O código descreve o tipo de vaga (e não a unidade)? */
export function isTypeDescriptorAmenity(code: string): boolean {
  return DESCRIPTOR_SET.has(code);
}

/** Remove os descritores de tipo de uma lista de códigos exibida num contexto por tipo de vaga. */
export function amenitiesExcludingTypeDescriptors(codes: string[]): string[] {
  return codes.filter((code) => !isTypeDescriptorAmenity(code));
}
