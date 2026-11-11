import { useBookingFilterOptions } from "./api";
import { FilterGroup, FilterSelect } from "./BookingFiltersPanel";
import {
  AFFILIATE_OPTIONS,
  PCD_OPTIONS,
  PLATE_CHANGE_OPTIONS,
  addOnOptions,
  utmOptions,
} from "./bookingFilterOptions";

export type ExtraFilterValues = {
  pcd: string;
  adicional: string;
  afiliado: string;
  campanha: string;
  placa: string;
};

/**
 * Conteúdo de "Mais filtros" da lista de reservas (14/10/2026; agrupado em 11/11/2026), igual no
 * Manager e no Operator. Vale para o Hub e para o site; afiliado só existe no site, então só
 * aparece para quem tem white-label.
 */
export function ExtraBookingFilters({
  values,
  onChange,
  showAffiliate,
  companyIds,
}: {
  values: ExtraFilterValues;
  onChange: (patch: Partial<ExtraFilterValues>) => void;
  showAffiliate: boolean;
  companyIds?: string[];
}) {
  const opcoes = useBookingFilterOptions(companyIds);
  return (
    <div className="grid gap-5 desktop:grid-cols-5">
      <FilterGroup title="Detalhes da reserva" className="desktop:col-span-3">
        <div className="grid grid-cols-2 gap-3 tablet:grid-cols-3">
          <FilterSelect
            id="booking-pcd"
            label="PCD"
            value={values.pcd}
            options={PCD_OPTIONS}
            onChange={(v) => onChange({ pcd: v })}
          />
          <FilterSelect
            id="booking-addon"
            label="Adicional"
            value={values.adicional}
            options={addOnOptions(opcoes.data?.add_ons ?? [])}
            onChange={(v) => onChange({ adicional: v })}
          />
          <FilterSelect
            id="booking-plate"
            label="Troca de placa"
            value={values.placa}
            options={PLATE_CHANGE_OPTIONS}
            onChange={(v) => onChange({ placa: v })}
          />
        </div>
      </FilterGroup>
      <FilterGroup title="Marketing" className="desktop:col-span-2">
        <div className="grid grid-cols-2 gap-3">
          <FilterSelect
            id="booking-utm"
            label="Campanha (UTM)"
            value={values.campanha}
            options={utmOptions(opcoes.data?.utm_sources ?? [])}
            onChange={(v) => onChange({ campanha: v })}
          />
          {showAffiliate && (
            <FilterSelect
              id="booking-affiliate"
              label="Afiliado"
              value={values.afiliado}
              options={AFFILIATE_OPTIONS}
              onChange={(v) => onChange({ afiliado: v })}
            />
          )}
        </div>
      </FilterGroup>
    </div>
  );
}
