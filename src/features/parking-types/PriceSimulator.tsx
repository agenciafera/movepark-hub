import * as React from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/format";
import { useSimulatePrice } from "./api";

type Props = {
  companySlug: string;
  locationSlug: string;
  parkingTypeCode: string;
};

/**
 * Simulador de preço — usa a função simulate_price() do banco
 * para validar a configuração atual sem precisar criar reserva.
 */
export function PriceSimulator({ companySlug, locationSlug, parkingTypeCode }: Props) {
  const [days, setDays] = React.useState(3);
  const sim = useSimulatePrice();

  function run() {
    sim.mutate({
      company: companySlug,
      location: locationSlug,
      parkingType: parkingTypeCode,
      days,
    });
  }

  const result = sim.data;
  const price =
    result && typeof result === "object" && "price" in result ? result.price : null;
  const oldPrice =
    result && typeof result === "object" && "old_price" in result
      ? result.old_price
      : null;
  const errorMsg =
    sim.error instanceof Error
      ? sim.error.message
      : result && typeof result === "object" && "error" in result
        ? result.error
        : null;

  return (
    <div className="space-y-3 rounded-md border border-hairline bg-surface-soft p-4">
      <div className="flex items-center gap-2 text-title-md text-ink">
        <Calculator className="h-4 w-4" /> Simulador de preço
      </div>

      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sim-days">Dias</Label>
          <Input
            id="sim-days"
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value || 1)))}
            className="h-10 w-24 text-center tabular-nums"
          />
        </div>
        <Button type="button" size="sm" onClick={run} disabled={sim.isPending}>
          {sim.isPending ? "Calculando…" : "Calcular"}
        </Button>
      </div>

      {price !== null && price !== undefined && (
        <div className="flex items-baseline gap-3">
          {oldPrice !== null && oldPrice !== undefined && oldPrice !== price && (
            <span className="text-body-sm text-muted line-through">
              {formatBRL(Number(oldPrice))}
            </span>
          )}
          <span className="text-display-md text-mp-primary">{formatBRL(Number(price))}</span>
          <span className="text-body-sm text-muted">
            ({days} {days === 1 ? "dia" : "dias"})
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-sm border border-error bg-badge-cancelled-bg p-2 text-body-sm text-error">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
