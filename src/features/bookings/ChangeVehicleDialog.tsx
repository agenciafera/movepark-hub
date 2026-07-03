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
import { useMyVehicles } from "@/features/vehicles/api";
import { useChangeBookingVehicle } from "./customerApi";

type Props = {
  bookingCode: string;
  profileId: string;
  currentVehicleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Troca o veículo da reserva (benefício Flex+ `plate_change`, E2.8-c/f). */
export function ChangeVehicleDialog({ bookingCode, profileId, currentVehicleId, open, onOpenChange }: Props) {
  const { data: vehicles, isLoading } = useMyVehicles(open ? profileId : undefined);
  const change = useChangeBookingVehicle();
  const [selected, setSelected] = React.useState<string | null>(currentVehicleId);

  React.useEffect(() => {
    if (open) setSelected(currentVehicleId);
  }, [open, currentVehicleId]);

  async function save() {
    if (!selected) return;
    try {
      await change.mutateAsync({ bookingCode, vehicleId: selected });
      toast.success("Veículo da reserva atualizado.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao trocar veículo");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar veículo</DialogTitle>
          <DialogDescription>Escolha qual veículo vai usar nesta reserva.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (vehicles ?? []).length === 0 ? (
          <p className="text-body-sm text-muted">
            Você ainda não tem veículos cadastrados. Adicione um na sua conta.
          </p>
        ) : (
          <div className="space-y-2">
            {vehicles!.map((v) => {
              const isSel = selected === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelected(v.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors",
                    isSel ? "border-ink ring-1 ring-ink" : "border-hairline hover:border-ink/40",
                  )}
                >
                  <span className="text-body-sm text-ink">
                    <span className="font-semibold tabular-nums">{v.license_plate}</span>
                    {v.model && <span className="text-muted"> · {v.model}</span>}
                    {v.color && <span className="text-muted"> · {v.color}</span>}
                  </span>
                  {isSel && <Check className="h-4 w-4 text-badge-confirmed-fg" />}
                </button>
              );
            })}
            <Button
              className="w-full"
              onClick={save}
              disabled={!selected || selected === currentVehicleId || change.isPending}
            >
              {change.isPending ? "Salvando…" : "Confirmar troca"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
