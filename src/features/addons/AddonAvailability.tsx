import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/ui/currency-input";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatBRL } from "@/lib/format";
import type { AddOnServiceWithAvailability } from "@/types/domain";
import { useCompanyLocations, useSetLocationAddon, type OperatorLocation } from "./api";
import { buildLocationAddonArgs } from "./addons.logic";

type Props = {
  open: boolean;
  companyId: string;
  addon: AddOnServiceWithAvailability | null;
  onOpenChange: (open: boolean) => void;
};

type RowState = { is_active: boolean; price_override: number | null };

export function AddonAvailability({ open, companyId, addon, onOpenChange }: Props) {
  const locations = useCompanyLocations(open ? companyId : undefined);
  const save = useSetLocationAddon(companyId);
  const [rows, setRows] = React.useState<Record<string, RowState>>({});

  React.useEffect(() => {
    if (!open || !addon) return;
    const byLocation = new Map(addon.availability.map((a) => [a.location_id, a]));
    const next: Record<string, RowState> = {};
    for (const loc of locations.data ?? []) {
      const cur = byLocation.get(loc.id);
      next[loc.id] = {
        is_active: cur?.is_active ?? false,
        price_override: cur?.price_override != null ? Number(cur.price_override) : null,
      };
    }
    setRows(next);
  }, [open, addon, locations.data]);

  function patch(locationId: string, p: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [locationId]: { ...prev[locationId], ...p } }));
  }

  async function handleSave() {
    if (!addon) return;
    try {
      const locs = locations.data ?? [];
      await Promise.all(
        locs.map((loc) => {
          const r = rows[loc.id];
          return save.mutateAsync(
            buildLocationAddonArgs(addon.id, loc.id, r.is_active, r.price_override),
          );
        }),
      );
      toast.success("Disponibilidade atualizada");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar disponibilidade");
    }
  }

  const locs = locations.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Disponibilidade: {addon?.name}</DialogTitle>
        </DialogHeader>

        {locations.isLoading ? (
          <p className="text-body-sm text-muted">Carregando unidades…</p>
        ) : locs.length === 0 ? (
          <EmptyState
            title="Sem unidades"
            description="Cadastre uma unidade antes de habilitar serviços."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-caption text-muted">
              Preço base do serviço: {formatBRL(Number(addon?.base_price ?? 0))}. Deixe o preço por
              unidade em branco para usar o preço base.
            </p>
            {locs.map((loc: OperatorLocation) => {
              const r = rows[loc.id] ?? { is_active: false, price_override: null };
              return (
                <div
                  key={loc.id}
                  className="flex items-center justify-between gap-4 rounded-md border border-hairline p-3"
                >
                  <label className="flex flex-1 items-center gap-3">
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={(v) => patch(loc.id, { is_active: v })}
                    />
                    <span className="text-body-sm text-ink">{loc.name}</span>
                  </label>
                  <div className="flex flex-col gap-1">
                    <Label className="text-caption">Preço (opcional)</Label>
                    <CurrencyInput
                      value={r.price_override}
                      onChange={(v) => patch(loc.id, { price_override: v })}
                      disabled={!r.is_active}
                      className="w-32"
                      placeholder="Base"
                    />
                  </div>
                </div>
              );
            })}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSave} disabled={save.isPending}>
                {save.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
