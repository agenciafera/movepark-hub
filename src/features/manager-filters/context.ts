import * as React from "react";
import type { PeriodState, Range } from "./managerFilters.logic";
import { DEFAULT_PERIOD, resolveCompare, resolvePeriod } from "./managerFilters.logic";

export type ManagerFiltersValue = {
  period: PeriodState;
  setPeriod: (next: PeriodState) => void;
  /** Intervalo resolvido: `from` inclusivo, `to` exclusivo. */
  range: Range;
  /** Intervalo de comparação, ou null quando está desligada. */
  compareRange: Range | null;
  /** Unidades escolhidas. Vazio quer dizer todas (o consolidado). */
  locationIds: string[];
  setLocationIds: (next: string[]) => void;
  /** `undefined` quando é "todas": é o que as queries esperam pra não filtrar. */
  scopedLocationIds: string[] | undefined;
  reset: () => void;
};

const fallbackRange = resolvePeriod(DEFAULT_PERIOD);

export const ManagerFiltersContext = React.createContext<ManagerFiltersValue>({
  period: DEFAULT_PERIOD,
  setPeriod: () => {},
  range: fallbackRange,
  compareRange: resolveCompare(DEFAULT_PERIOD, fallbackRange),
  locationIds: [],
  setLocationIds: () => {},
  scopedLocationIds: undefined,
  reset: () => {},
});

/**
 * Filtros do painel do Manager (período + unidade). O valor mora no
 * ManagerFilterProvider, montado no shell, então a escolha acompanha o usuário
 * de uma página pra outra em vez de zerar a cada navegação.
 */
export function useManagerFilters() {
  return React.useContext(ManagerFiltersContext);
}
