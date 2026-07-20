import * as React from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStoredTheme, setStoredTheme, type Theme } from "@/lib/theme";

/**
 * Botão de tema no header — alterna entre claro ("clean") e grafite escuro.
 * SSR-safe: começa em "light" (igual ao HTML pré-renderizado) e sincroniza com
 * a escolha salva após montar, então não há mismatch de hidratação.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<Theme>("light");

  React.useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setStoredTheme(next);
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      title={isDark ? "Tema claro" : "Tema grafite"}
      // `cn` e não concatenação: quem passa `hidden tablet:inline-flex` precisa que o
      // `hidden` vença o `inline-flex` da base, e só o tailwind-merge resolve isso.
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-ink transition-colors hover:bg-surface-soft",
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
