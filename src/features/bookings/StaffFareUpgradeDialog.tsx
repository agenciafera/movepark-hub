import * as React from "react";
import { toast } from "sonner";
import { Check } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { FARE_TIER_LABEL, type FareTier } from "@/lib/fares";
import { useCreateFareUpgrade, useFareCatalog, type FareUpgradeResponse } from "@/features/fares/api";
import { PixChargePanel } from "./PixChargePanel";
import { pixMessage, tierLanded, upgradeTargets } from "./staffChange.logic";

type Props = {
  bookingCode: string;
  currentTier: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWaitingChange: (waiting: boolean) => void;
};

/**
 * Upgrade de plano gerado pela equipe (26/11/2026): o cliente pede no balcão ou no telefone, a equipe
 * escolhe o plano e mostra o PIX. O valor vai inteiro para a Movepark, como no upgrade que o cliente
 * faz sozinho. O preço da lista é o do catálogo; quem calcula a diferença de verdade é a Edge.
 */
export function StaffFareUpgradeDialog({ bookingCode, currentTier, open, onOpenChange, onWaitingChange }: Props) {
  const catalog = useFareCatalog();
  const upgrade = useCreateFareUpgrade();
  const [target, setTarget] = React.useState<FareTier | null>(null);
  const [charge, setCharge] = React.useState<FareUpgradeResponse | null>(null);

  const alvos = upgradeTargets(currentTier);
  const precos = new Map((catalog.data ?? []).map((f) => [f.tier, f.price_cents]));
  const atual = precos.get((currentTier ?? "basica") as FareTier) ?? 0;
  const pago = !!charge && !!target && tierLanded(currentTier, target);

  React.useEffect(() => {
    if (!open) {
      setCharge(null);
      setTarget(null);
    } else if (!target && alvos.length > 0) {
      setTarget(alvos[0]);
    }
  }, [open, target, alvos]);

  React.useEffect(() => {
    onWaitingChange(open && !!charge && !pago);
  }, [open, charge, pago, onWaitingChange]);

  async function gerar() {
    if (!target) return;
    try {
      setCharge(await upgrade.mutateAsync({ booking_code: bookingCode, target_tier: target }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui gerar o PIX do upgrade.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fazer upgrade de plano</DialogTitle>
          <DialogDescription>
            O cliente paga só a diferença entre os planos. O plano muda assim que o PIX entra.
          </DialogDescription>
        </DialogHeader>

        {charge ? (
          <>
            <PixChargePanel
              amount={charge.delta}
              qrCode={charge.qr_code}
              expiresAt={charge.expires_at}
              message={pixMessage({ code: bookingCode, amount: charge.delta, what: "upgrade" })}
              paid={pago}
              paidText={`A reserva agora é ${target ? FARE_TIER_LABEL[target] : "do novo plano"}.`}
            />
            <Button variant="secondary" className="w-full" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </>
        ) : catalog.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : alvos.length === 0 ? (
          <p className="text-body-sm text-muted">A reserva já está no plano mais completo.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              {alvos.map((tier) => {
                const preco = precos.get(tier);
                const sel = target === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    data-testid={`staff-upgrade-${tier}`}
                    onClick={() => setTarget(tier)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors",
                      sel ? "border-ink ring-1 ring-ink" : "border-hairline hover:border-ink/40",
                    )}
                  >
                    <span className="flex items-center gap-2 text-body-sm text-ink">
                      {sel && <Check className="h-4 w-4 text-badge-confirmed-fg" />}
                      {FARE_TIER_LABEL[tier]}
                    </span>
                    {preco != null && (
                      <span className="text-body-sm font-semibold tabular-nums text-ink">
                        + {formatBRL(Math.max(0, preco - atual) / 100)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-caption text-muted">
              Plano atual: {FARE_TIER_LABEL[(currentTier ?? "basica") as FareTier]}. Upgrade pago não tem
              devolução.
            </p>
            <Button className="w-full" onClick={() => void gerar()} disabled={!target || upgrade.isPending}>
              {upgrade.isPending ? "Gerando o PIX…" : "Gerar o PIX"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
