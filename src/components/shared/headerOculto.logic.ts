/** Altura do header. Abaixo disso ele nunca some: no topo não há o que ganhar. */
export const ALTURA_DO_HEADER = 80;

/**
 * Rolagem menor que isso não conta.
 *
 * Sem o piso, o quique da rolagem por inércia do celular e o próprio reflow da
 * página alternavam o header entre esconder e aparecer a cada quadro, e a barra
 * tremia sozinha com o dedo parado.
 */
const PISO = 6;

/**
 * O header deve estar escondido depois desta rolagem?
 *
 * Descer esconde, subir mostra, e o topo da página sempre mostra. É a regra que
 * devolve a tela inteira para o conteúdo sem tirar a navegação de alcance: ela
 * volta no primeiro gesto para cima, que é o gesto de quem quer sair da página.
 */
export function proximoOculto(
  anterior: number,
  atual: number,
  ocultoAgora: boolean,
  alturaDoHeader = ALTURA_DO_HEADER,
): boolean {
  // O topo é sempre visível. Também cobre o repique negativo do iOS.
  if (atual <= alturaDoHeader) return false;

  const delta = atual - anterior;
  if (Math.abs(delta) < PISO) return ocultoAgora;
  return delta > 0;
}
