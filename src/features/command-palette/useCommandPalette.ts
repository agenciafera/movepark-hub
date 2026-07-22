import * as React from "react";

/** Estado + atalho de teclado da palette, para o shell só precisar renderizá-la. */
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ⌘K no mac, Ctrl+K no resto. A barra "/" fica de fora de propósito: o
      // painel tem campo de texto em quase toda tela e roubaria a tecla.
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}
