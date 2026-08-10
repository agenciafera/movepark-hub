import * as React from "react";

/**
 * Qual seção está sendo lida, pro índice acompanhar a rolagem.
 *
 * `IntersectionObserver` no lugar de listener de scroll: o cálculo de posição roda
 * no navegador, não a cada evento. O `rootMargin` recorta a janela de detecção pra
 * faixa logo abaixo da nav sticky (96px) até 30% da altura da tela, senão duas
 * seções ficam visíveis ao mesmo tempo e o item ativo pisca entre elas.
 *
 * Só toca no browser: durante o build SSG este efeito não roda, e o índice sai com
 * a primeira seção marcada.
 */
export function useActiveSection(ids: string[]): string | null {
  const [ativa, setAtiva] = React.useState<string | null>(null);
  const chave = ids.join("|");

  React.useEffect(() => {
    const alvos = chave
      .split("|")
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (alvos.length === 0 || typeof IntersectionObserver === "undefined") return;

    // Guarda quem está visível pra escolher sempre a primeira em ordem de página.
    const visiveis = new Set<string>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visiveis.add(e.target.id);
          else visiveis.delete(e.target.id);
        }
        const primeira = alvos.find((el) => visiveis.has(el.id));
        if (primeira) setAtiva(primeira.id);
      },
      { rootMargin: "-96px 0px -70% 0px" },
    );

    alvos.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [chave]);

  // Enquanto nenhuma seção cruzou a faixa de detecção (página no topo, ou lista que
  // chegou depois da montagem), vale a primeira. Sem isso o índice ficava sem nenhum
  // item marcado justamente na abertura da página.
  return ativa && ids.includes(ativa) ? ativa : (ids[0] ?? null);
}
