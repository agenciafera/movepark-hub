import * as React from "react";
import { ALTURA_DO_HEADER, proximoOculto } from "./headerOculto.logic";

/** A partir daqui o header não se esconde: é o breakpoint `desktop` do projeto. */
const LARGURA_DE_DESKTOP = 1128;

/**
 * Esconde o header ao descer e devolve ao subir.
 *
 * A leitura acontece no `requestAnimationFrame`, e não no próprio evento: a
 * rolagem dispara dezenas de vezes por segundo, e ler `scrollY` a cada disparo
 * força o navegador a recalcular layout no meio do gesto. Com o rAF, é uma
 * leitura por quadro.
 *
 * O agendamento cancela e reagenda em vez de travar num booleano. Com a trava,
 * bastava um quadro que nunca chegasse (aba em segundo plano, janela oculta) para
 * ela ficar presa em "já agendei" e o header parar de responder à rolagem para
 * sempre, sem erro nenhum. Cancelando e reagendando, ele se recupera sozinho
 * quando os quadros voltam.
 *
 * `passive: true` porque o listener nunca chama `preventDefault`, e sem a dica o
 * navegador segura a rolagem esperando para ver se ele vai chamar.
 *
 * Só abaixo do desktop. Em tela grande o header não custa altura de leitura, e é
 * lá que moram as colunas `sticky` que se apoiam nele (o índice das páginas de
 * conteúdo, a lateral do post, os filtros da busca).
 */
export function useHeaderOculto(): boolean {
  const [oculto, setOculto] = React.useState(false);

  /*
    O quanto o header ainda ocupa no topo, publicado para o resto da página.

    Quem gruda logo abaixo dele (o índice das páginas de conteúdo) precisa
    acompanhar: com um `top` fixo, o header some e sobra um vão entre o topo da
    tela e o índice. A variável desce em CSS, então o elemento se ajusta sem
    precisar de contexto nem de prop atravessando a árvore.
  */
  React.useEffect(() => {
    document.documentElement.style.setProperty(
      "--topbar-offset",
      oculto ? "0px" : `${ALTURA_DO_HEADER}px`,
    );
  }, [oculto]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    let anterior = window.scrollY;
    let frame = 0;
    /*
      Espelho local do estado, em vez da forma funcional do `setOculto`.

      O atualizador funcional lia `anterior`, que é reatribuído logo abaixo, e o
      React pode invocar o atualizador mais de uma vez com a mesma entrada: na
      segunda passada `anterior` já era o valor novo, a variação dava zero e o
      header ficava preso escondido depois de rolar para cima. Calculando antes
      de chamar, o atualizador vira um valor pronto.
    */
    let ocultoAgora = false;

    const medir = () => {
      const atual = window.scrollY;
      const emDesktop = window.innerWidth >= LARGURA_DE_DESKTOP;
      const proximo = emDesktop ? false : proximoOculto(anterior, atual, ocultoAgora);
      anterior = atual;
      if (proximo === ocultoAgora) return;
      ocultoAgora = proximo;
      setOculto(proximo);
    };

    const agendar = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(medir);
    };

    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
    };
  }, []);

  return oculto;
}
