import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "@/lib/icons";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { StepShell } from "../StepShell";
import { useSetAddons, type OnboardingData } from "../wizardApi";

type Props = { data: OnboardingData; companyId: string; onNext: () => void; onBack: () => void };
type Row = { name: string; base_price: number | null };

export function Step5AddOns({ data, companyId, onNext, onBack }: Props) {
  const save = useSetAddons(companyId);
  const locationId = data.location?.id;
  const [rows, setRows] = React.useState<Row[]>(
    data.addons.length ? data.addons.map((a) => ({ name: a.name, base_price: a.base_price })) : [],
  );

  function patch(idx: number, p: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...p } : r)));
  }

  async function persist(): Promise<boolean> {
    if (!locationId) {
      toast.error("Cadastre a localização primeiro.");
      return false;
    }
    const items = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), base_price: r.base_price ?? 0 }));
    try {
      await save.mutateAsync({ p_company_id: companyId, p_location_id: locationId, p_items: items });
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar serviços");
      return false;
    }
  }

  return (
    <StepShell
      title="Serviços adicionais"
      description="Opcional: serviços extras como lava-jato. Pode pular."
      onBack={onBack}
      onNext={async () => {
        if (await persist()) onNext();
      }}
      busy={save.isPending}
      secondaryAction={
        <Button variant="ghost" onClick={onNext} disabled={save.isPending}>
          Pular
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {rows.map((r, idx) => (
          <div key={idx} className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label className="text-caption">Serviço</Label>
              <Input value={r.name} onChange={(e) => patch(idx, { name: e.target.value })} placeholder="Ex: Lava-jato" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-caption">Preço</Label>
              <CurrencyInput value={r.base_price} onChange={(v) => patch(idx, { base_price: v })} className="w-32" />
            </div>
            <Button variant="ghost" size="icon" onClick={() => setRows((p) => p.filter((_, i) => i !== idx))} aria-label="Remover">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setRows((p) => [...p, { name: "", base_price: null }])}>
          <Plus className="h-4 w-4" /> Adicionar serviço
        </Button>
      </div>
    </StepShell>
  );
}
