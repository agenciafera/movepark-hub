import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { clearedParams, nextParams, readFilters, type FilterDefaults } from "./urlFilters.logic";

/**
 * Filtros da tela no endereço (`?status=confirmed&pagina=2`): persistem no F5 e no link.
 * `set` troca filtros (e volta para a primeira página, se `resetKey` for informado e não vier no
 * patch); `clear` volta tudo ao padrão. Usa `replace`, para não encher o histórico a cada tecla.
 */
export function useUrlFilters<D extends FilterDefaults>(defaults: D, resetKey?: keyof D & string) {
  const [params, setParams] = useSearchParams();
  const filters = React.useMemo(() => readFilters(params, defaults), [params, defaults]);
  const set = React.useCallback(
    (patch: Partial<D>) => setParams((p) => nextParams(p, defaults, patch, resetKey), { replace: true }),
    [setParams, defaults, resetKey],
  );
  const clear = React.useCallback(
    () => setParams((p) => clearedParams(p, defaults), { replace: true }),
    [setParams, defaults],
  );
  return { filters, set, clear };
}
