import * as React from "react";
import { ManagerFiltersContext } from "./context";
import type { ManagerFiltersValue } from "./context";
import type { PeriodState } from "./managerFilters.logic";
import { DEFAULT_PERIOD, resolveCompare, resolvePeriod } from "./managerFilters.logic";

const STORAGE_KEY = "movepark:manager-filters";

type Stored = { period: PeriodState; locationIds: string[] };

function read(): Stored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (!parsed?.period?.preset) return null;
    return {
      period: { ...DEFAULT_PERIOD, ...parsed.period },
      locationIds: Array.isArray(parsed.locationIds) ? parsed.locationIds : [],
    };
  } catch {
    // sessionStorage bloqueado ou JSON quebrado: cai no default em silêncio.
    return null;
  }
}

/**
 * Guarda o período e as unidades escolhidas no painel do Manager. Fica no shell,
 * então trocar de página não zera o filtro: quem olhou julho no dashboard continua
 * em julho ao abrir Reservas.
 *
 * A escolha é gravada no sessionStorage (dura a aba, não a vida toda). Uma
 * preferência de análise não deve sobreviver a semanas e fazer o painel abrir com
 * um recorte antigo sem ninguém lembrar por quê.
 */
export function ManagerFilterProvider({ children }: { children: React.ReactNode }) {
  const initial = React.useRef<Stored | null>(null);
  if (initial.current === null)
    initial.current = read() ?? { period: DEFAULT_PERIOD, locationIds: [] };

  const [period, setPeriodState] = React.useState<PeriodState>(initial.current.period);
  const [locationIds, setLocationIdsState] = React.useState<string[]>(initial.current.locationIds);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ period, locationIds }));
    } catch {
      // Sem storage o filtro segue funcionando na sessão da página.
    }
  }, [period, locationIds]);

  const value = React.useMemo<ManagerFiltersValue>(() => {
    const range = resolvePeriod(period);
    return {
      period,
      setPeriod: setPeriodState,
      range,
      compareRange: resolveCompare(period, range),
      locationIds,
      setLocationIds: setLocationIdsState,
      scopedLocationIds: locationIds.length ? locationIds : undefined,
      reset: () => {
        setPeriodState(DEFAULT_PERIOD);
        setLocationIdsState([]);
      },
    };
  }, [period, locationIds]);

  return <ManagerFiltersContext.Provider value={value}>{children}</ManagerFiltersContext.Provider>;
}
