/**
 * Ordem das fotos na ficha (05/11/2026). O tipo de vaga é escolhido dentro da página, e quem
 * escolhe Descoberta precisa ver o pátio aberto primeiro, não o toldo da Coberta. Por isso a
 * galeria abre com as fotos do tipo em evidência (`location_parking_type.photos`) e segue com as
 * da unidade (`location.photos`: fachada, recepção, traslado), que valem para qualquer vaga.
 *
 * A mesma foto nas duas listas aparece uma vez só, na posição do tipo.
 */
export function galeriaDaFicha(
  fotosDaVaga: readonly string[] | null | undefined,
  fotosDaUnidade: readonly string[] | null | undefined,
): string[] {
  return unicas([...(fotosDaVaga ?? []), ...(fotosDaUnidade ?? [])]);
}

/**
 * Todas as fotos da unidade, de todos os tipos de vaga, para o `image` do JSON-LD. O schema
 * descreve o estacionamento inteiro, e a página mostra as fotos de cada tipo ao trocar a vaga.
 */
export function fotosDaUnidade(
  fotosDaUnidade: readonly string[] | null | undefined,
  tipos: readonly { photos?: readonly string[] | null }[] | null | undefined,
): string[] {
  return unicas([...(fotosDaUnidade ?? []), ...(tipos ?? []).flatMap((t) => t.photos ?? [])]);
}

function unicas(urls: string[]): string[] {
  return [...new Set(urls.filter((u) => typeof u === "string" && u.trim() !== ""))];
}
