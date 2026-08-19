/**
 * Palavra do tipo de destino que gira no H1 da home ("Estacione em qualquer
 * ___ do Brasil"). Extraído do componente para testar sem montar o `Hero`
 * inteiro (vídeo, GSAP, TanStack Query).
 *
 * Fecha o Q do ClickUp 86ak0e78q ("a headline da home deve falar só de
 * aeroporto?", reunião de 13/08). Conferido no banco em 19/08/2026: o
 * catálogo já publica unidade fora de aeroporto (`destination.type`):
 * `bus_terminal` (Terminal Rodoviário Tietê), `city_center` (Centro de São
 * Paulo, Centro de Nova Iguaçu) e `district` (Jardim Paulista). A frase só-
 * aeroporto já estava errada hoje, não é um risco que "vai acontecer" quando
 * o mensalista entrar. "Aeroporto" segue primeiro porque ainda é a maioria
 * (13 das 18 unidades listadas na mesma conferência).
 *
 * Critério de manutenção (o que a reunião pediu registrado): some uma
 * palavra aqui quando um `destination.type` novo ganhar a primeira unidade
 * publicada; tire quando não sobrar nenhuma unidade daquele tipo.
 */
export const ROTATING_HERO_WORDS = ["aeroporto", "rodoviária", "bairro"] as const;

/** Próximo índice da rotação, voltando ao início ao chegar no fim. */
export function proximaPalavraIndex(indiceAtual: number, total: number): number {
  if (total <= 0) return 0;
  return (indiceAtual + 1) % total;
}
