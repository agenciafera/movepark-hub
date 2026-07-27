import * as React from "react";

/**
 * `true` quando o usuário pediu menos movimento no sistema (prefers-reduced-motion).
 *
 * Começa em `false` de propósito, pra bater com o HTML do SSG (onde `matchMedia` não
 * existe) e não dar mismatch de hidratação; atualiza no efeito, no cliente. Use pra
 * decidir entre uma versão animada e uma estática — não só pra zerar a duração.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
