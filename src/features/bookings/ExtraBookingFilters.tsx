import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useBookingFilterOptions } from "./api";
import {
  AFFILIATE_OPTIONS,
  PLATE_CHANGE_OPTIONS,
  addOnOptions,
  utmOptions,
} from "./bookingFilterOptions";

export type ExtraFilterValues = {
  adicional: string;
  afiliado: string;
  campanha: string;
  placa: string;
};

function Filtro({
  id,
  label,
  value,
  options,
  onChange,
  className,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  className?: string;
}) {
  // Valor que veio no link e não existe mais nas opções (adicional renomeado) continua no select,
  // para a tela não mentir sobre o filtro aplicado.
  const opts = options.some((o) => o.value === value)
    ? options
    : [...options, { value, label: value }];
  return (
    <div className={className ?? "flex flex-col gap-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Filtros de adicional, campanha, troca de placa e afiliado da lista de reservas (14/10/2026),
 * iguais no Manager e no Operator. Valem para o Hub e para o site; afiliado só existe no site,
 * então só aparece para quem tem white-label.
 */
export function ExtraBookingFilters({
  values,
  onChange,
  showAffiliate,
  companyIds,
  itemClassName,
}: {
  values: ExtraFilterValues;
  onChange: (patch: Partial<ExtraFilterValues>) => void;
  showAffiliate: boolean;
  companyIds?: string[];
  itemClassName?: string;
}) {
  const opcoes = useBookingFilterOptions(companyIds);
  return (
    <>
      <Filtro
        id="booking-addon"
        label="Adicional"
        value={values.adicional}
        options={addOnOptions(opcoes.data?.add_ons ?? [])}
        onChange={(v) => onChange({ adicional: v })}
        className={itemClassName}
      />
      <Filtro
        id="booking-utm"
        label="Campanha (origem)"
        value={values.campanha}
        options={utmOptions(opcoes.data?.utm_sources ?? [])}
        onChange={(v) => onChange({ campanha: v })}
        className={itemClassName}
      />
      <Filtro
        id="booking-plate"
        label="Troca de placa"
        value={values.placa}
        options={PLATE_CHANGE_OPTIONS}
        onChange={(v) => onChange({ placa: v })}
        className={itemClassName}
      />
      {showAffiliate && (
        <Filtro
          id="booking-affiliate"
          label="Afiliado"
          value={values.afiliado}
          options={AFFILIATE_OPTIONS}
          onChange={(v) => onChange({ afiliado: v })}
          className={itemClassName}
        />
      )}
    </>
  );
}
