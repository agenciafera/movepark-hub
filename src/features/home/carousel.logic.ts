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

/**
 * Suavização do passo do carrossel (easeInOutCubic).
 *
 * O avanço agora é de um card por vez, e um passo linear denuncia a máquina:
 * começa e para de forma seca. Acelerar no início e frear no fim faz o card
 * parecer empurrado, não teleportado.
 *
 * O progresso é grampeado em [0, 1] porque o relógio do quadro pode estourar o
 * fim do passo quando a aba volta do segundo plano.
 */
export function suavizar(t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}
