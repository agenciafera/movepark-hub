import * as React from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { StepShell } from "../StepShell";
import { useSetParkingTypes, type OnboardingData } from "../wizardApi";

type Props = { data: OnboardingData; companyId: string; onNext: () => void; onBack: () => void };

type RowState = { selected: boolean; base_price: number | null; capacity: string };

export function Step3ParkingTypes({ data, companyId, onNext, onBack }: Props) {
  const save = useSetParkingTypes(companyId);
  const locationId = data.location?.id;

  const [rows, setRows] = React.useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const pt of data.catalog) {
      const existing = data.items.find((i) => i.parking_type_id === pt.id);
      init[pt.id] = existing
        ? { selected: true, base_price: existing.base_price, capacity: String(existing.capacity) }
        : { selected: false, base_price: null, capacity: "" };
    }
    return init;
  });

  function patch(id: string, p: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }

  async function handleNext() {
    if (!locationId) return toast.error("Cadastre a localização primeiro.");
    const items = data.catalog
      .filter((pt) => rows[pt.id]?.selected)
      .map((pt) => ({
        parking_type_id: pt.id,
        base_price: rows[pt.id].base_price ?? 0,
        capacity: Number(rows[pt.id].capacity || 0),
      }));
    if (!items.length) return toast.error("Selecione ao menos um tipo de vaga.");
    if (items.some((i) => i.capacity <= 0)) return toast.error("Informe a capacidade de cada tipo selecionado.");

    try {
      await save.mutateAsync({ p_company_id: companyId, p_location_id: locationId, p_items: items });
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <StepShell
      title="Tipos de vaga"
      description="Selecione os tipos que você oferece e defina capacidade e preço base."
      onBack={onBack}
      onNext={handleNext}
      busy={save.isPending}
    >
      <div className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
        {data.catalog.map((pt) => {
          const row = rows[pt.id];
          return (
            <div key={pt.id} className="flex flex-col gap-3 p-4 tablet:flex-row tablet:items-center">
              <label className="flex flex-1 items-center gap-3">
                <Checkbox
                  checked={row.selected}
                  onCheckedChange={(v) => patch(pt.id, { selected: v === true })}
                />
                <span className="text-body-md text-ink">{pt.name}</span>
                <span className="text-caption text-muted">{pt.code}</span>
              </label>
              {row.selected && (
                <div className="flex gap-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-caption">Preço base/dia</Label>
                    <CurrencyInput
                      value={row.base_price}
                      onChange={(v) => patch(pt.id, { base_price: v })}
                      className="w-32"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-caption">Capacidade</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.capacity}
                      onChange={(e) => patch(pt.id, { capacity: e.target.value })}
                      className="w-24"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </StepShell>
  );
}
