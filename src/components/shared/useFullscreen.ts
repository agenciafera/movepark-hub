import * as React from "react";

/**
 * Modo tela cheia de um painel (o canvas de campanha, o kanban de leads).
 *
 * Não é a Fullscreen API do navegador de propósito: aquela toma a tela inteira, esconde a barra de
 * endereço e pede permissão em alguns contextos. Aqui o que se quer é o painel ocupar a janela sem
 * o shell do Manager em volta, continuando uma página normal, com URL visível e atalhos do
 * navegador funcionando.
 *
 * O `Esc` mora aqui e não em cada tela porque é o gesto que todo mundo tenta primeiro: sem ele a
 * saída fica presa num botão que o próprio modo empurra para o canto.
 */
export function useFullscreen(inicial = false) {
  const [fullscreen, setFullscreen] = React.useState(inicial);

  React.useEffect(() => {
    if (!fullscreen) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [fullscreen]);

  // O body não rola atrás do painel. Sem isto, rolar dentro do kanban "vaza" para a página de
  // baixo quando a lista acaba, e a tela cheia treme.
  React.useEffect(() => {
    if (!fullscreen || typeof document === "undefined") return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [fullscreen]);

  const entrar = React.useCallback(() => setFullscreen(true), []);
  const sair = React.useCallback(() => setFullscreen(false), []);
  const alternar = React.useCallback(() => setFullscreen((v) => !v), []);

  return { fullscreen, entrar, sair, alternar };
}
