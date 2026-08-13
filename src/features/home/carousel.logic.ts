/**
 * Próxima posição do carrossel infinito.
 *
 * A trilha tem o mesmo conjunto de cards duas vezes, então qualquer posição
 * depois do primeiro conjunto tem uma gêmea idêntica `larguraDoSet` atrás. Ao
 * cruzar essa marca, voltar o mesmo tanto deixa a tela igual e o loop não tem
 * emenda: é o que evita a volta correndo até o zero, que denuncia a repetição.
 *
 * O mesmo vale para trás, para quem arrasta o carrossel no sentido contrário e
 * chega antes do início.
 */
export function proximaPosicao(atual: number, passo: number, larguraDoSet: number): number {
  if (larguraDoSet <= 0) return atual;
  const bruto = atual + passo;
  if (bruto >= larguraDoSet) return bruto - larguraDoSet;
  if (bruto < 0) return bruto + larguraDoSet;
  return bruto;
}
