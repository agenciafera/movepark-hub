/**
 * Opt-out de medição (privacidade, base "legítimo interesse com opt-out").
 *
 * A escolha vive numa chave de `localStorage`, por navegador, e é lida por dois gates: o
 * snippet do GTM no `index.html` (que roda antes do app e por isso lê a chave à mão, pelo
 * mesmo nome) e o `initClarity()`. Com a chave presente, nenhum dos dois injeta script.
 *
 * `localStorage` pode não existir (SSG), estar bloqueado (navegação privada, política do
 * navegador) ou lançar ao ser lido; em todos esses casos a leitura responde "mede" e a
 * escrita responde que não conseguiu, para o rodapé dizer isso em vez de fingir que
 * gravou.
 */
export const MEASUREMENT_OPTOUT_KEY = "mp_no_measure";

/** Se este navegador pediu para não ser medido. */
export function isMeasurementOptedOut(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    return window.localStorage.getItem(MEASUREMENT_OPTOUT_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Liga ou desliga o opt-out. Devolve se a escolha ficou gravada: sem `localStorage` o
 * pedido não tem onde morar, e quem chama precisa saber.
 */
export function setMeasurementOptOut(optedOut: boolean): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    if (optedOut) window.localStorage.setItem(MEASUREMENT_OPTOUT_KEY, "1");
    else window.localStorage.removeItem(MEASUREMENT_OPTOUT_KEY);
    return true;
  } catch {
    return false;
  }
}
