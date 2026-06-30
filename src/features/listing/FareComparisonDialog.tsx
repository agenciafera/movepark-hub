import { Check, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FareTier = "basic" | "flex" | "superflex";

const FEATURES: { label: string; tiers: [boolean, boolean, boolean] }[] = [
  { label: "Cancelamento grátis até 24h", tiers: [true, true, true] },
  { label: "E-mail de confirmação", tiers: [true, true, true] },
  { label: "Vaga garantida", tiers: [true, true, true] },
  { label: "SMS/WhatsApp + lembrete", tiers: [false, true, true] },
  { label: "Trocar placa / veículo", tiers: [false, true, true] },
  { label: "Alterar data e horário", tiers: [false, true, true] },
  { label: "Cancelar até 1 min antes", tiers: [false, false, true] },
  { label: "Proteção contra atraso de voo", tiers: [false, false, true] },
  { label: "Suporte prioritário", tiers: [false, false, true] },
];

const TIERS: {
  id: FareTier;
  label: string;
  tagline: string;
  popular?: boolean;
}[] = [
  { id: "basic", label: "Básica", tagline: "Grátis" },
  { id: "flex", label: "Flex", tagline: "+ R$ 12,90", popular: true },
  { id: "superflex", label: "Superflex", tagline: "+ R$ 24,90" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFare: FareTier;
  onSelect: (fare: FareTier) => void;
  priceLabelByTier?: Partial<Record<FareTier, string>>;
  availableTiers?: FareTier[];
};

export function FareComparisonDialog({
  open,
  onOpenChange,
  selectedFare,
  onSelect,
  priceLabelByTier,
  availableTiers,
}: Props) {
  const visibleTiers = availableTiers
    ? TIERS.filter((t) => availableTiers.includes(t.id))
    : TIERS;

  const taglineOf = (t: (typeof TIERS)[number]) => priceLabelByTier?.[t.id] ?? t.tagline;
  const tierIndex = (id: FareTier) => TIERS.findIndex((t) => t.id === id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6 tablet:p-8">
        <p className="mb-6 text-display-sm text-ink">O que cada tarifa inclui</p>

        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
          {visibleTiers.map((tier) => {
            const isSelected = selectedFare === tier.id;
            const ti = tierIndex(tier.id);

            return (
              <div
                key={tier.id}
                className={cn(
                  "flex flex-col rounded-md border-2 p-5 transition-colors",
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
                <ul className="flex-1 space-y-3">
                  {FEATURES.map((f, fi) => {
                    const included = f.tiers[ti];
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
      </DialogContent>
    </Dialog>
  );
}
