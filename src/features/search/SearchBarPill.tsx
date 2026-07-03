import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { addDays, addHours, set } from "date-fns";
import { Search, Car, Bike } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DestinationCombobox } from "./DestinationCombobox";
import { DateRangeField } from "./DateRangeField";
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(
        "flex w-full max-w-4xl items-stretch rounded-full bg-canvas",
        variant === "hero"
          ? "h-[72px] border border-hairline shadow-tier"
          : "h-14 border border-hairline shadow-tier",
        className,
      )}
    >
      <div className="flex-[1.4] border-r border-hairline">
        <DestinationCombobox
          value={dest}
          pointValue={point}
          onChange={(d, p) => {
            setDest(d);
            setPoint(p ?? null);
          }}
        />
      </div>
      <div className="flex-1 border-r border-hairline">
        <DateRangeField
          mode="check-in"
          date={from}
          onChange={(d) => {
            setFrom(d);
            // Garante check-out > check-in
            if (to && to <= d) setTo(addDays(d, 1));
          }}
        />
      </div>
      <div className="flex-1 border-r border-hairline">
        <DateRangeField
          mode="check-out"
          date={to}
          onChange={setTo}
          minDate={from ?? undefined}
        />
      </div>
      <div className="hidden tablet:block w-[140px] border-r border-hairline">
        <VehicleField value={vehicle} onChange={setVehicle} />
      </div>
      <div className="flex items-center px-2">
        <Button
          type="submit"
          size="icon"
          className="h-12 w-12 rounded-full"
          aria-label="Buscar"
        >
          <Search className="h-5 w-5" />
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
    <div className="flex h-full w-full items-center px-4">
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
