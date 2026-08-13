import * as React from "react";

/** Marca a barra de busca do hero, para o header saber quando ela saiu da tela. */
export const HERO_SEARCH_ATTR = "[data-hero='search']";

/**
 * A busca do hero já passou por cima do header?
 *
 * Na home o hero traz a barra grande, então o header nasce sem busca: duas barras
 * na mesma tela competem pelo mesmo clique. Depois que a do hero sobe, o header
 * assume, e a busca volta a estar sempre a um toque de distância, como nas outras
 * páginas.
 *
 * `IntersectionObserver` em vez de listener de scroll: o cálculo roda no
 * navegador, não a cada pixel rolado. O `rootMargin` negativo no topo desconta a
 * altura do header (80px), senão a troca acontece com a barra do hero ainda
 * visível atrás dele.
 *
 * O teste de `top < 0` é o que separa "rolou para baixo e passou" de "ainda não
 * chegou": sem ele, um hero fora da tela por qualquer motivo já ligaria a busca.
 */
export function useHeroSearchPassed(ativo: boolean): boolean {
  const [passou, setPassou] = React.useState(false);

  React.useEffect(() => {
    if (!ativo) {
      setPassou(false);
      return;
    }
    const alvo = document.querySelector(HERO_SEARCH_ATTR);
    if (!alvo || typeof IntersectionObserver === "undefined") return;

    const obs = new IntersectionObserver(
      ([entrada]) => setPassou(!entrada.isIntersecting && entrada.boundingClientRect.top < 0),
      { rootMargin: "-80px 0px 0px 0px" },
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [ativo]);

  return passou;
}
