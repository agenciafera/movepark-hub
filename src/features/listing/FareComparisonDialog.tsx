import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FareTier = "basic" | "flex" | "superflex";

const FEATURES: { label: string; tiers: [boolean, boolean, boolean] }[] = [
  { label: "Cancelamento grátis até 24h", tiers: [true, true, true] },
  { label: "E-mail de confirmação", tiers: [true, true, true] },
  { label: "Vaga garantida", tiers: [true, true, true] },
  { label: "SMS/WhatsApp + lembrete de chegada", tiers: [false, true, true] },
  { label: "Trocar placa / veículo", tiers: [false, true, true] },
  { label: "Alterar data e horário", tiers: [false, true, true] },
  { label: "Cancelar até 1 min antes", tiers: [false, false, true] },
  { label: "Proteção contra atraso de voo", tiers: [false, false, true] },
  { label: "Suporte prioritário", tiers: [false, false, true] },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFare: FareTier;
  onSelect: (fare: FareTier) => void;
};

const TIERS: { id: FareTier; label: string; tagline: string; popular?: boolean }[] = [
  { id: "basic", label: "Básica", tagline: "Grátis" },
  { id: "flex", label: "Flex", tagline: "+ R$ 12,90", popular: true },
  { id: "superflex", label: "Superflex", tagline: "+ R$ 24,90" },
];

export function FareComparisonDialog({ open, onOpenChange, selectedFare, onSelect }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-display-sm text-ink">O que cada tarifa inclui</DialogTitle>
        </DialogHeader>

        <div className="overflow-x-auto px-6 pb-6 pt-4">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="w-[45%] pb-5" />
                {TIERS.map((tier) => (
                  <th key={tier.id} className="relative pb-5 text-center align-bottom">
                    {tier.popular && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                        <span className="whitespace-nowrap rounded-full bg-mp-primary px-3 py-1 text-caption font-semibold text-on-primary">
                          Mais popular
                        </span>
                      </div>
                    )}
                    <div
                      className={cn(
                        "rounded-t-md border-x border-t pt-5",
                        tier.popular ? "border-mp-primary/40 bg-mp-pale/30" : "border-transparent",
                      )}
                    >
                      <p className="text-body-sm font-semibold text-ink">{tier.label}</p>
                      <p
                        className={cn(
                          "text-body-sm font-semibold",
                          tier.id === "basic" ? "text-badge-confirmed-fg" : "text-mp-primary",
                        )}
                      >
                        {tier.tagline}
                      </p>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((feature, fi) => {
                const isLast = fi === FEATURES.length - 1;
                return (
                  <tr key={fi} className="border-t border-hairline">
                    <td className="py-3 pr-4 text-body-sm text-body">{feature.label}</td>
                    {TIERS.map((tier, ti) => {
                      const included = feature.tiers[ti];
                      return (
                        <td
                          key={ti}
                          className={cn(
                            "py-3 text-center",
                            tier.popular && [
                              "border-x border-mp-primary/40 bg-mp-pale/20",
                              isLast && "rounded-b-md border-b",
                            ],
                          )}
                        >
                          {included ? (
                            <CheckCircle2 className="mx-auto h-5 w-5 text-badge-confirmed-fg" />
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {/* Spacer row for select buttons */}
              <tr>
                <td className="pb-1 pt-4" />
                {TIERS.map((tier) => (
                  <td
                    key={tier.id}
                    className={cn(
                      "pb-1 pt-4 text-center",
                      tier.popular && "rounded-b-md border-x border-b border-mp-primary/40 bg-mp-pale/20",
                    )}
                  >
                    <Button
                      size="sm"
                      variant={selectedFare === tier.id ? "primary" : "outline"}
                      className="w-full"
                      onClick={() => {
                        onSelect(tier.id);
                        onOpenChange(false);
                      }}
                    >
                      Selecionar
                    </Button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
