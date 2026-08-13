import * as React from "react";
import { proximoOculto } from "./headerOculto.logic";

/**
 * Esconde o header ao descer e devolve ao subir.
 *
 * A leitura acontece no `requestAnimationFrame`, e não no próprio evento: a
 * rolagem dispara dezenas de vezes por segundo, e ler `scrollY` a cada disparo
 * força o navegador a recalcular layout no meio do gesto. Com o rAF, é uma
 * leitura por quadro.
 *
 * `passive: true` porque o listener nunca chama `preventDefault`, e sem a dica o
 * navegador segura a rolagem esperando para ver se ele vai chamar.
 */
export function useHeaderOculto(): boolean {
  const [oculto, setOculto] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    let anterior = window.scrollY;
    let agendado = false;

    const medir = () => {
      agendado = false;
      const atual = window.scrollY;
      setOculto((antes) => proximoOculto(anterior, atual, antes));
      anterior = atual;
    };

    const aoRolar = () => {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(medir);
    };

    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  return oculto;
}
