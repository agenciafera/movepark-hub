import * as React from "react";
import { useLocation } from "react-router-dom";

/**
 * Rola pro topo a cada troca de rota (pathname). Reseta o scroll da window
 * (shells do consumidor/conta) e o de containers internos marcados com
 * `data-scroll-root` (shell manager/operator usa `<main overflow-auto>`).
 * Depende só do pathname → mudanças de query/hash (filtros, âncoras) não resetam.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll<HTMLElement>("[data-scroll-root]").forEach((el) => {
      el.scrollTop = 0;
    });
  }, [pathname]);
  return null;
}
