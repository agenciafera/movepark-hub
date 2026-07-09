/**
 * Tema visual do app — claro ("clean") ou grafite escuro ("dark").
 * A classe `.dark` no <html> liga as sobrescritas de token em index.css.
 * A escolha persiste em localStorage e é aplicada antes do paint por um
 * script inline em index.html (evita o flash na carga).
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "mp-theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setStoredTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage indisponível (SSR/privado) — só aplica visualmente */
  }
  applyTheme(theme);
}
