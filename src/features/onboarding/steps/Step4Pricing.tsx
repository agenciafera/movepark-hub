import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepShell } from "../StepShell";
import { useSetPricing, type OnboardingData } from "../wizardApi";
import { buildPricingTiers, initState, type Bracket, type PriceState } from "./Step4Pricing.logic";

type Props = { data: OnboardingData; companyId: string; onNext: () => void; onBack: () => void };

export function Step4Pricing({ data, companyId, onNext, onBack }: Props) {
  const save = useSetPricing(companyId);
  const [state, setState] = React.useState<Record<string, PriceState>>(() => {
    const init: Record<string, PriceState> = {};
    for (const item of data.items) init[item.location_parking_type_id] = initState(item);
    return init;
  });

  function patch(id: string, p: Partial<PriceState>) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }
  function patchBracket(id: string, idx: number, p: Partial<Bracket>) {
    setState((prev) => {
      const brackets = prev[id].brackets.map((b, i) => (i === idx ? { ...b, ...p } : b));
      return { ...prev, [id]: { ...prev[id], brackets } };
    });
  }
  function addBracket(id: string) {
    setState((prev) => ({
      ...prev,
      [id]: { ...prev[id], brackets: [...prev[id].brackets, { from_day: "", to_day: "", total_price: null }] },
    }));
  }
  function removeBracket(id: string, idx: number) {
    setState((prev) => ({
      ...prev,
      [id]: { ...prev[id], brackets: prev[id].brackets.filter((_, i) => i !== idx) },
    }));
  }

  async function handleNext() {
    if (!data.items.length) return toast.error("Cadastre os tipos de vaga primeiro.");
    try {
      for (const item of data.items) {
        const built = buildPricingTiers(state[item.location_parking_type_id]);
        if (!built.ok) {
          throw new Error(
            built.reason === "daily"
              ? `Informe o preço diário de ${item.name}.`
              : `Defina ao menos uma faixa para ${item.name}.`,
          );
        }
        await save.mutateAsync({
          p_company_id: companyId,
          p_location_parking_type_id: item.location_parking_type_id,
          p_strategy: built.strategy,
          p_tiers: built.tiers,
        });
      }
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar preços");
    }
  }

  return (
    <StepShell
      title="Precificação"
      description="Defina como cobrar cada tipo de vaga."
      onBack={onBack}
      onNext={handleNext}
      busy={save.isPending}
    >
      <div className="flex flex-col gap-4">
        {data.items.map((item) => {
          const ps = state[item.location_parking_type_id];
          if (!ps) return null;
          return (
            <div key={item.location_parking_type_id} className="rounded-md border border-hairline p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-title-sm text-ink">{item.name}</span>
                <Select value={ps.mode} onValueChange={(v) => patch(item.location_parking_type_id, { mode: v as PriceState["mode"] })}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed_daily">Preço fixo por dia</SelectItem>
                    <SelectItem value="fixed_bracket">Valor fixo por faixa de dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {ps.mode === "fixed_daily" ? (
                <div className="flex flex-col gap-1">
                  <Label className="text-caption">Preço por dia</Label>
                  <CurrencyInput
                    value={ps.daily}
                    onChange={(v) => patch(item.location_parking_type_id, { daily: v })}
                    className="w-40"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {ps.brackets.map((b, idx) => (
                    <div key={idx} className="flex items-end gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-caption">De (dias)</Label>
                        <Input type="number" min={1} value={b.from_day} onChange={(e) => patchBracket(item.location_parking_type_id, idx, { from_day: e.target.value })} className="w-20" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-caption">Até (dias)</Label>
                        <Input type="number" min={1} value={b.to_day} onChange={(e) => patchBracket(item.location_parking_type_id, idx, { to_day: e.target.value })} placeholder="∞" className="w-20" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-caption">Valor total</Label>
                        <CurrencyInput value={b.total_price} onChange={(v) => patchBracket(item.location_parking_type_id, idx, { total_price: v })} className="w-32" />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeBracket(item.location_parking_type_id, idx)} aria-label="Remover faixa">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => addBracket(item.location_parking_type_id)} className="w-fit">
                    <Plus className="h-4 w-4" /> Adicionar faixa
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </StepShell>
  );
}
