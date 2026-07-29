import { useManagerFilters } from "./context";
import { LocationPicker } from "./LocationPicker";
import { PeriodPicker } from "./PeriodPicker";

type Props = {
  /** Telas sem recorte de tempo (moderação, cadastro) escondem o período. */
  showPeriod?: boolean;
  /** Telas que não comparam períodos escondem o bloco de comparação. */
  showCompare?: boolean;
  showLocations?: boolean;
};

/**
 * Barra de filtros do Manager: período e unidade, do mesmo jeito em toda página.
 * O estado mora no ManagerFilterProvider, então trocar de tela não perde o recorte.
 */
export function ManagerFilterBar({
  showPeriod = true,
  showCompare = true,
  showLocations = true,
}: Props) {
  const { period, setPeriod, locationIds, setLocationIds } = useManagerFilters();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showLocations && (
        <LocationPicker
          value={locationIds}
          onChange={setLocationIds}
          className="w-full tablet:w-[220px]"
        />
      )}
      {showPeriod && (
        <PeriodPicker
          value={period}
          onChange={setPeriod}
          showCompare={showCompare}
          className="w-full tablet:w-[230px]"
        />
      )}
    </div>
  );
}
