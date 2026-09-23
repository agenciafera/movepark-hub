import { Check, Info, X } from "@phosphor-icons/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fareReais, type FareOption } from "@/lib/fares";
import { formatBRL } from "@/lib/format";
import { buildFareMatrix } from "./fareMatrix.logic";

type FareTier = "basic" | "flex" | "superflex";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFare: FareTier;
  onSelect: (fare: FareTier) => void;
  /** O catálogo da unidade (`get_unit_fares`). Vazio cai no padrão. */
  fares: FareOption[];
};

export function FareComparisonDialog({
  open,
  onOpenChange,
  selectedFare,
  onSelect,
  fares,
}: Props) {
  // A matriz sai do catálogo (Manager › Tarifas), não de booleanos escritos aqui.
  const { tiers, rows } = buildFareMatrix(fares);
  const taglineOf = (t: (typeof tiers)[number]) => (t.priceCents === 0 ? "Grátis" : `+ ${formatBRL(fareReais(t.priceCents))}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full max-w-5xl overflow-y-auto p-8 tablet:p-14">
        <p className="mb-8 text-display-sm text-ink">O que cada tarifa inclui</p>

        <div className="grid grid-cols-1 gap-6 tablet:grid-cols-3">
          {tiers.map((tier, ti) => {
            const isSelected = selectedFare === tier.id;

            return (
              <div
                key={tier.id}
                className={cn(
                  "flex flex-col rounded-md border-2 p-6 transition-colors",
                  tier.popular
                    ? "border-mp-primary bg-mp-pale/20"
                    : "border-hairline bg-canvas",
                )}
              >
                {/* Header */}
                <div className="mb-4">
                  {tier.popular ? (
                    <span className="mb-2 inline-block rounded-full bg-mp-primary px-2.5 py-0.5 text-caption font-semibold text-on-primary">
                      Mais popular
                    </span>
                  ) : (
                    <span className="mb-2 inline-block h-[22px]" />
                  )}
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-title-md text-ink">{tier.label}</p>
                    <p
                      className={cn(
                        "text-title-sm font-semibold tabular-nums",
                        tier.id === "basic" ? "text-badge-confirmed-fg" : "text-mp-primary",
                      )}
                    >
                      {taglineOf(tier)}
                    </p>
                  </div>
                </div>

                {/* Separador */}
                <div className="mb-4 h-px bg-hairline" />

                {/* Features */}
                <ul className="flex-1 space-y-4">
                  {rows.map((f, fi) => {
                    const included = f.included[ti];
                    return (
                      <li
                        key={fi}
                        className={cn(
                          "flex items-start gap-2.5 text-body-sm",
                          included ? "text-ink" : "text-muted",
                        )}
                      >
                        {included ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-badge-confirmed-fg" />
                        ) : (
                          <X className="mt-0.5 h-4 w-4 shrink-0 text-muted opacity-40" />
                        )}
                        {f.label}
                      </li>
                    );
                  })}
                </ul>

                {/* CTA */}
                <Button
                  size="sm"
                  variant={isSelected ? "primary" : "outline"}
                  className="mt-6 w-full"
                  onClick={() => {
                    onSelect(tier.id);
                    onOpenChange(false);
                  }}
                >
                  {isSelected ? "Selecionada" : "Selecionar"}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Vale em qualquer tarifa: fica fora do grid para não ocupar três colunas sem diferenciar. */}
        <ul className="mt-8 flex flex-col gap-1 text-body-sm text-muted">
          <li className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-badge-confirmed-fg" />
            Vaga garantida em qualquer tarifa.
          </li>
          {rows.some((r) => r.label === "Alteração de data/horário") && (
            <li className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Ao alterar a data, a estadia é recalculada pelo preço do dia da alteração.
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
