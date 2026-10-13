/**
 * Filtros de tela guardados no endereço (13/10/2026): sobrevivem ao F5, ao voltar do detalhe e
 * viajam no link. Só entra na URL o que difere do padrão, para o endereço limpo continuar limpo.
 * Mudar qualquer filtro volta a paginação para o início (`resetKey`), senão a tela abriria na
 * página 7 de um recorte que só tem 2.
 */
export type FilterDefaults = Record<string, string>;

export function readFilters<D extends FilterDefaults>(params: URLSearchParams, defaults: D): D {
  const out = { ...defaults };
  for (const k of Object.keys(defaults) as (keyof D & string)[]) {
    const v = params.get(k);
    if (v !== null) (out as Record<string, string>)[k] = v;
  }
  return out;
}

export function nextParams<D extends FilterDefaults>(
  params: URLSearchParams,
  defaults: D,
  patch: Partial<D>,
  resetKey?: keyof D & string,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const aplicar = { ...patch } as Record<string, string | undefined>;
  // Filtro mudou e a página não veio junto: volta para o início.
  if (resetKey && !(resetKey in patch)) aplicar[resetKey] = defaults[resetKey];
  for (const [k, v] of Object.entries(aplicar)) {
    if (v === undefined || v === defaults[k]) next.delete(k);
    else next.set(k, v);
  }
  return next;
}

export function clearedParams<D extends FilterDefaults>(params: URLSearchParams, defaults: D): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const k of Object.keys(defaults)) next.delete(k);
  return next;
}

export function hasActiveFilters<D extends FilterDefaults>(f: D, defaults: D, ignore: (keyof D)[] = []): boolean {
  return (Object.keys(defaults) as (keyof D)[]).some((k) => !ignore.includes(k) && f[k] !== defaults[k]);
}
