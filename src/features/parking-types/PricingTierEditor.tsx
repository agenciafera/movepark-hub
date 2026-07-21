import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import type { PricingStrategy } from "./strategies";
import { tierUsesUnitPrice } from "./strategies";

export type TierDraft = {
  /** id existente no banco ou string temporária prefixada com "tmp_" */
  id: string;
  from_day: number;
  to_day: number | null;
  unit_price: number | null;
  total_price: number | null;
};

type Props = {
  strategy: PricingStrategy;
  tiers: TierDraft[];
  onChange: (tiers: TierDraft[]) => void;
};

let tmpCounter = 0;
function makeTmpId() {
  tmpCounter += 1;
  return `tmp_${Date.now()}_${tmpCounter}`;
}

/**
 * Editor de faixas de preço. Suporta 3 estratégias de tier:
 * - tiered_progressive / uniform_by_duration → preço por dia (unit_price)
 * - fixed_bracket → valor total fixo (total_price), com unit_price opcional p/ faixa aberta
 */
export function PricingTierEditor({ strategy, tiers, onChange }: Props) {
  const usesUnit = tierUsesUnitPrice(strategy);

  function addTier() {
    const lastTo = tiers.length > 0 ? tiers[tiers.length - 1].to_day : null;
    const from = lastTo ? lastTo + 1 : 1;
    onChange([
      ...tiers,
      {
        id: makeTmpId(),
        from_day: from,
        to_day: from,
        unit_price: usesUnit ? 0 : null,
        total_price: usesUnit ? null : 0,
      },
    ]);
  }

  function updateTier(id: string, patch: Partial<TierDraft>) {
    onChange(tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeTier(id: string) {
    onChange(tiers.filter((t) => t.id !== id));
  }

  return (
    <div className="space-y-3">
      {/* No mobile cada faixa vira um bloco com rótulo próprio: em 12 colunas os campos
          espremiam e o valor aparecia cortado ("R$ 40,"). */}
      <div className="hidden grid-cols-12 items-center gap-2 px-1 tablet:grid">
        <Label className="col-span-2">De (dia)</Label>
        <Label className="col-span-2">Até (dia)</Label>
        {strategy === "fixed_bracket" ? (
          <>
            <Label className="col-span-3">Preço total fixo</Label>
            <Label className="col-span-4">Preço/dia (faixa aberta)</Label>
          </>
        ) : (
          <Label className="col-span-7">Preço por dia</Label>
        )}
        <span className="col-span-1" />
      </div>

      {tiers.length === 0 && (
        <div className="rounded-sm border border-dashed border-hairline bg-surface-soft p-4 text-center text-body-sm text-muted">
          Nenhuma faixa configurada. Adicione a primeira.
        </div>
      )}

      {tiers.map((tier) => (
        <div
          key={tier.id}
          className="flex flex-col gap-3 rounded-sm border border-hairline p-3 tablet:grid tablet:grid-cols-12 tablet:items-center tablet:gap-2 tablet:rounded-none tablet:border-0 tablet:p-0"
        >
          <div className="grid grid-cols-2 gap-2 tablet:col-span-4 tablet:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="tablet:hidden">De (dia)</Label>
              <Input
                aria-label="De (dia)"
                className="h-12 text-center tabular-nums"
                type="number"
                min={1}
                value={tier.from_day}
                onChange={(e) => updateTier(tier.id, { from_day: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="tablet:hidden">Até (dia)</Label>
              <Input
                aria-label="Até (dia)"
                className="h-12 text-center tabular-nums"
                type="number"
                min={tier.from_day}
                value={tier.to_day ?? ""}
                placeholder="∞"
                onChange={(e) =>
                  updateTier(tier.id, {
                    to_day: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          {strategy === "fixed_bracket" ? (
            <>
              <div className="flex flex-col gap-1.5 tablet:col-span-3">
                <Label className="tablet:hidden">Preço total fixo</Label>
                <CurrencyInput
                  aria-label="Preço total fixo"
                  value={tier.total_price}
                  onChange={(v) => updateTier(tier.id, { total_price: v })}
                />
              </div>
              <div className="flex flex-col gap-1.5 tablet:col-span-4">
                <Label className="tablet:hidden">Preço por dia</Label>
                <CurrencyInput
                  aria-label="Preço por dia (faixa aberta)"
                  value={tier.unit_price}
                  onChange={(v) => updateTier(tier.id, { unit_price: v })}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5 tablet:col-span-7">
              <Label className="tablet:hidden">Preço por dia</Label>
              <CurrencyInput
                aria-label="Preço por dia"
                value={tier.unit_price}
                onChange={(v) => updateTier(tier.id, { unit_price: v })}
              />
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full gap-2 text-error tablet:col-span-1 tablet:h-11 tablet:w-11 tablet:p-0"
            onClick={() => removeTier(tier.id)}
            title="Remover faixa"
          >
            <Trash2 className="h-4 w-4" />
            <span className="tablet:hidden">Remover faixa</span>
          </Button>
        </div>
      ))}

      <Button type="button" variant="secondary" size="sm" onClick={addTier}>
        <Plus className="h-4 w-4" /> Adicionar faixa
      </Button>

      {strategy === "fixed_bracket" && (
        <p className="text-caption text-muted">
          Cada faixa aceita <em>um</em> dos dois: <em>Preço total fixo</em>, que vale para
          qualquer estadia dentro da faixa, ou <em>Preço/dia</em>, que é multiplicado pelos dias
          da reserva. O total fixo tem prioridade se os dois estiverem preenchidos. Na faixa
          final aberta (sem "Até"), use <em>Preço/dia</em>.
        </p>
      )}
    </div>
  );
}
