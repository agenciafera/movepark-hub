import * as React from "react";
import { toast } from "sonner";
import { Check } from "@/lib/icons";
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
import { toDataUrl } from "@/lib/qr";
import { fareReais, FARE_TIER_LABEL, type FareTier } from "@/lib/fares";
import { useCreateFareUpgrade, useFareCatalog, type FareUpgradeResponse } from "./api";

type Props = {
  bookingCode: string;
  currentTier: FareTier;
  currentFarePriceCents: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Upgrade de Tarifa pós-reserva (E2.8-d): escolhe o nível-alvo, paga o delta via PIX. */
export function FareUpgradeDialog({
  bookingCode,
  currentTier,
  currentFarePriceCents,
  open,
  onOpenChange,
}: Props) {
  const catalog = useFareCatalog();
  const upgrade = useCreateFareUpgrade();
  const [target, setTarget] = React.useState<FareTier | null>(null);
  const [charge, setCharge] = React.useState<FareUpgradeResponse | null>(null);
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);

  // Só níveis acima da Tarifa atual (delta > 0).
  const targets = (catalog.data ?? []).filter((f) => f.price_cents > currentFarePriceCents);

  React.useEffect(() => {
    if (open && !target && targets.length > 0) setTarget(targets[targets.length - 1].tier);
  }, [open, target, targets]);

  async function handleUpgrade() {
    if (!target) return;
    try {
      const res = await upgrade.mutateAsync({ booking_code: bookingCode, target_tier: target });
      setCharge(res);
      if (res.qr_code) setQrUrl(await toDataUrl(res.qr_code, 220));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar o upgrade");
    }
  }

  function close(o: boolean) {
    if (!o) {
      setCharge(null);
      setQrUrl(null);
      setTarget(null);
    }
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fazer upgrade de Tarifa</DialogTitle>
          <DialogDescription>
            Suba o nível da sua reserva pagando só a diferença.
          </DialogDescription>
        </DialogHeader>

        {charge ? (
          <div className="space-y-3 text-center">
            <p className="text-body-sm text-muted">
              Pague <strong className="text-ink">{formatBRL(charge.delta)}</strong> via PIX para
              concluir o upgrade. A Tarifa é atualizada assim que o pagamento for confirmado.
            </p>
            {qrUrl && <img src={qrUrl} alt="QR code do PIX" className="mx-auto h-[220px] w-[220px]" />}
            <p className="break-all rounded-sm bg-surface-soft p-2 text-caption text-muted">
              {charge.qr_code}
            </p>
            <Button variant="secondary" className="w-full" onClick={() => close(false)}>
              Fechar
            </Button>
          </div>
        ) : catalog.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : targets.length === 0 ? (
          <p className="text-body-sm text-muted">Você já está na Tarifa mais alta.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              {targets.map((f) => {
                const delta = fareReais(f.price_cents - currentFarePriceCents);
                const isSel = target === f.tier;
                return (
                  <button
                    key={f.tier}
                    type="button"
                    onClick={() => setTarget(f.tier)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors",
                      isSel ? "border-ink ring-1 ring-ink" : "border-hairline hover:border-ink/40",
                    )}
                  >
                    <span className="flex items-center gap-2 text-body-sm text-ink">
                      {isSel && <Check className="h-4 w-4 text-badge-confirmed-fg" />}
                      {f.label}
                    </span>
                    <span className="text-body-sm font-semibold text-ink tabular-nums">
                      + {formatBRL(delta)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-caption text-muted">
              Você está na Tarifa {FARE_TIER_LABEL[currentTier]}. Sem reembolso se mudar de ideia.
            </p>
            <Button className="w-full" onClick={handleUpgrade} disabled={!target || upgrade.isPending}>
              {upgrade.isPending ? "Gerando PIX…" : "Pagar diferença com PIX"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
