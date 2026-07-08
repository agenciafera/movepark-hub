import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { addDays, addHours, set } from "date-fns";
import { Search, Car, Bike } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DestinationCombobox } from "./DestinationCombobox";
import { DateRangePicker } from "./DateRangePicker";
import { buildSearchParams, type Vehicle } from "./SearchBarPill.logic";
import { cn } from "@/lib/utils";

type Props = {
  /** Estilo "hero" (expandido) ou "compact" (mais baixo, sem sombra forte). */
  variant?: "hero" | "compact";
  className?: string;
  initialDest?: string | null;
  initialPoint?: string | null;
  initialFrom?: Date | null;
  initialTo?: Date | null;
  initialVehicle?: Vehicle;
  /** Preserva os filtros já na URL (estacionamento, comodidades, ordenação…) na re-busca. Usado na
   *  página de resultados; na home fica false (busca nova). */
  preserveParams?: boolean;
};

function nextWeekendDefaults(): { from: Date; to: Date } {
  const now = new Date();
  const from = addHours(set(now, { minutes: 0, seconds: 0, milliseconds: 0 }), 24);
  // 22:00 next day
  const fromAt22 = set(from, { hours: 22 });
  const to = set(addDays(fromAt22, 5), { hours: 8 });
  return { from: fromAt22, to };
}

export function SearchBarPill({
  variant = "hero",
  className,
  initialDest = null,
  initialPoint = null,
  initialFrom = null,
  initialTo = null,
  initialVehicle = "car",
  preserveParams = false,
}: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaults = React.useMemo(nextWeekendDefaults, []);
  const [dest, setDest] = React.useState<string | null>(initialDest);
  const [point, setPoint] = React.useState<string | null>(initialPoint);
  const [from, setFrom] = React.useState<Date | null>(initialFrom ?? defaults.from);
  const [to, setTo] = React.useState<Date | null>(initialTo ?? defaults.to);
  const [vehicle, setVehicle] = React.useState<Vehicle>(initialVehicle);

  function submit() {
    const next = buildSearchParams({
      base: preserveParams ? searchParams : null,
      dest,
      point,
      from,
      to,
      vehicle,
    });
    navigate(`/search?${next.toString()}`);
  }

  // Padding vertical que dá altura aos campos quando empilhados no mobile; no pill (tablet+)
  // a altura vem da própria barra (h-[72px]/h-14) e o py volta a zero.
  const fieldTrigger = "py-3.5 tablet:py-0";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(
        // Mobile: card empilhado (coluna). Tablet+: pill horizontal.
        "flex w-full max-w-4xl flex-col rounded-3xl border border-hairline bg-canvas shadow-tier",
        "tablet:flex-row tablet:items-stretch tablet:rounded-full",
        variant === "hero" ? "tablet:h-[72px]" : "tablet:h-14",
        className,
      )}
    >
      <div className="min-w-0 flex-[1.4] border-b border-hairline tablet:border-b-0 tablet:border-r">
        <DestinationCombobox
          value={dest}
          pointValue={point}
          triggerClassName={fieldTrigger}
          onChange={(d, p) => {
            setDest(d);
            setPoint(p ?? null);
          }}
        />
      </div>
      <div className="min-w-0 flex-[2] border-b border-hairline tablet:border-b-0 tablet:border-r">
        <DateRangePicker
          from={from}
          to={to}
          triggerClassName={fieldTrigger}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
          }}
        />
      </div>
      <div className="min-w-0 border-b border-hairline tablet:w-[140px] tablet:border-b-0 tablet:border-r">
        <VehicleField value={vehicle} onChange={setVehicle} />
      </div>
      <div className="flex items-center p-2 tablet:px-2 tablet:py-0">
        <Button
          type="submit"
          className="h-12 w-full gap-2 rounded-full tablet:w-12 tablet:gap-0 tablet:px-0"
          aria-label="Buscar"
        >
          <Search className="h-5 w-5 shrink-0" />
          <span className="tablet:hidden">Buscar</span>
        </Button>
      </div>
    </form>
  );
}

function VehicleField({
  value,
  onChange,
}: {
  value: Vehicle;
  onChange: (v: Vehicle) => void;
}) {
  return (
    <div className="flex h-full w-full items-center px-6 py-3.5 tablet:px-4 tablet:py-0">
      <Select value={value} onValueChange={(v) => onChange(v as Vehicle)}>
        <SelectTrigger className="h-auto !border-none !bg-transparent !p-0 !shadow-none focus:!border-none">
          <div className="flex flex-col items-start gap-0.5 text-left">
            <span className="text-caption font-medium text-ink">Veículo</span>
            <span className="line-clamp-1 text-body-sm text-muted">
              <SelectValue />
            </span>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="car">
            <span className="inline-flex items-center gap-2">
              <Car className="h-4 w-4" /> Carro
            </span>
          </SelectItem>
          <SelectItem value="motorcycle">
            <span className="inline-flex items-center gap-2">
              <Bike className="h-4 w-4" /> Moto
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
