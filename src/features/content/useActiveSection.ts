import * as React from "react";
import {
  baseDaFaixa,
  ROOT_MARGIN,
  secaoAtiva,
  TOPO_FAIXA_PX,
  type Medida,
} from "./useActiveSection.logic";

/**
 * Qual seção está sendo lida, pro índice acompanhar a rolagem.
 *
 * `IntersectionObserver` no lugar de listener de scroll: ele avisa quando alguma
 * seção cruza a faixa de leitura, sem rodar a cada evento. Quem escolhe a seção é
 * `secaoAtiva`, medindo os alvos no momento do aviso, e não o histórico de quem
 * entrou e saiu. Esse histórico era um `Set`, e ele guardava a seção anterior
 * quando ela vazava uma fração de pixel dentro da faixa: o índice acendia o item
 * de cima, ou parava de acender no fim da página. Medir na hora custa alguns
 * `getBoundingClientRect` por aviso, que são poucos e só quando alguém cruza.
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

    const escolher = () => {
      const medidas: Medida[] = alvos.map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.id, topo: r.top, base: r.bottom };
      });
      const escolhida = secaoAtiva(medidas, TOPO_FAIXA_PX, baseDaFaixa(window.innerHeight));
      // `null` é a página no topo, antes de qualquer seção. Aí vale o que já estava,
      // e quem abre a página vê a primeira marcada pelo retorno lá embaixo.
      if (escolhida) setAtiva(escolhida);
    };

    const obs = new IntersectionObserver(escolher, { rootMargin: ROOT_MARGIN });
    alvos.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [chave]);

  // Enquanto nenhuma seção cruzou a faixa de detecção (página no topo, ou lista que
  // chegou depois da montagem), vale a primeira. Sem isso o índice ficava sem nenhum
  // item marcado justamente na abertura da página.
  return ativa && ids.includes(ativa) ? ativa : (ids[0] ?? null);
}
