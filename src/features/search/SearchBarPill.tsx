import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bicycle, Car, MagnifyingGlass } from "@phosphor-icons/react";
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
import { defaultSearchDates } from "./dates";
import { SEARCH_FIELD_DIVIDER } from "./searchFieldStyles";
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
  /** Dispara depois de navegar pra `/search`. Usado pra fechar o modal de busca no mobile. */
  onSubmit?: () => void;
};

export function SearchBarPill({
  variant = "hero",
  className,
  initialDest = null,
  initialPoint = null,
  initialFrom = null,
  initialTo = null,
  initialVehicle = "car",
  preserveParams = false,
  onSubmit,
}: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // A mesma janela que a lista de resultados assume quando a URL não traz datas. As duas
  // saem de `dates.ts` de propósito: com contas separadas, a barra propunha um período e a
  // busca respondia por outro.
  const defaults = React.useMemo(() => defaultSearchDates(new Date()), []);
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
    onSubmit?.();
  }

  // Padding vertical que dá altura aos campos quando empilhados no mobile; no pill (tablet+)
  // a altura vem da própria barra (h-[76px]/h-14) e o py volta a zero.
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
        variant === "hero" ? "tablet:h-[76px]" : "tablet:h-14",
        className,
      )}
    >
      <div className={cn("min-w-0 flex-[1.5]", SEARCH_FIELD_DIVIDER)}>
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
      <div className={cn("min-w-0 flex-[2]", SEARCH_FIELD_DIVIDER)}>
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
      <div className={cn("min-w-0 tablet:w-[156px]", SEARCH_FIELD_DIVIDER)}>
        <VehicleField value={vehicle} onChange={setVehicle} />
      </div>
      {/* O respiro lateral do botão acompanha o vertical (a folga entre ele e a borda da barra),
          senão ele encosta na ponta direita enquanto sobra ar em cima e embaixo. */}
      <div
        className={cn(
          "flex items-center p-2 tablet:py-0",
          variant === "hero" ? "tablet:px-3.5" : "tablet:px-2",
        )}
      >
        <Button
          type="submit"
          className={cn(
            "h-12 w-full gap-2 rounded-full tablet:gap-0 tablet:px-0",
            variant === "hero" ? "tablet:w-12" : "tablet:h-10 tablet:w-10",
          )}
          aria-label="Buscar"
        >
          <MagnifyingGlass className="h-5 w-5 shrink-0" />
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
    <div className="flex h-full w-full items-center px-6 py-3.5 tablet:py-0">
      <Select value={value} onValueChange={(v) => onChange(v as Vehicle)}>
        <SelectTrigger className="h-auto !border-none !bg-transparent !p-0 !shadow-none focus:!border-none">
          <div className="flex flex-col items-start gap-1 text-left">
            <span className="text-caption font-medium text-ink">Veículo</span>
            {/* h-5 pra a linha do valor medir o mesmo que a dos outros campos: o ícone dentro
                do SelectValue esticava a caixa em 3px e subia o rótulo "Veículo" 2px acima de
                "Onde" e "Check-in". */}
            <span className="flex h-5 items-center text-body-sm text-muted">
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
              <Bicycle className="h-4 w-4" /> Moto
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
