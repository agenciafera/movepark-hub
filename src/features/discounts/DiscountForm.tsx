import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DiscountRuleWithRestrictions, DiscountType } from "@/types/domain";
import { useCompanyLocations } from "@/features/addons/api";
import { useCompanyParkingTypes } from "@/features/coupons/api";
import { useUpsertDiscount } from "./api";
import {
  buildDiscountUpsertArgs,
  EMPTY_DISCOUNT_FORM,
  isoToDateInput,
  validateDiscountForm,
  type DiscountFormValues,
} from "./discounts.logic";

const ALL_LOCATIONS = "__all__";

type Props = {
  open: boolean;
  companyId: string;
  discount: DiscountRuleWithRestrictions | null;
  onOpenChange: (open: boolean) => void;
};

function numOrNull(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

export function DiscountForm({ open, companyId, discount, onOpenChange }: Props) {
  const upsert = useUpsertDiscount(companyId);
  const locations = useCompanyLocations(open ? companyId : undefined);
  const parkingTypes = useCompanyParkingTypes(open ? companyId : undefined);
  const isEdit = !!discount;
  const [f, setF] = React.useState<DiscountFormValues>(EMPTY_DISCOUNT_FORM);

  React.useEffect(() => {
    if (!open) return;
    setF(
      discount
        ? {
            name: discount.name,
            description: discount.description ?? "",
            location_id: discount.location_id,
            discount_type: discount.discount_type,
            discount_value: Number(discount.discount_value),
            valid_from: isoToDateInput(discount.valid_from),
            valid_until: isoToDateInput(discount.valid_until),
            min_days: discount.min_days,
            min_amount: discount.min_amount != null ? Number(discount.min_amount) : null,
            advance_days: discount.advance_days,
            allow_coupon_stack: discount.allow_coupon_stack,
            priority: discount.priority,
            is_active: discount.is_active,
            sort_order: discount.sort_order,
            parking_type_ids: discount.parking_type_ids,
          }
        : EMPTY_DISCOUNT_FORM,
    );
  }, [open, discount]);

  function set<K extends keyof DiscountFormValues>(k: K, v: DiscountFormValues[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  function toggleParkingType(id: string) {
    setF((prev) => ({
      ...prev,
      parking_type_ids: prev.parking_type_ids.includes(id)
        ? prev.parking_type_ids.filter((x) => x !== id)
        : [...prev.parking_type_ids, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateDiscountForm(f);
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await upsert.mutateAsync(buildDiscountUpsertArgs(companyId, discount?.id ?? null, f));
      toast.success(isEdit ? "Desconto atualizado" : "Desconto criado");
      onOpenChange(false);
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Erro ao salvar desconto");
    }
  }

  const types = parkingTypes.data ?? [];
  const locs = locations.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar desconto" : "Novo desconto automático"}</DialogTitle>
        </DialogHeader>
        <form className="grid grid-cols-1 gap-4 tablet:grid-cols-2" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="d-name">Nome *</Label>
            <Input
              id="d-name"
              required
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ex: Promoção de inverno"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-location">Unidade</Label>
            <Select
              value={f.location_id ?? ALL_LOCATIONS}
              onValueChange={(v) => set("location_id", v === ALL_LOCATIONS ? null : v)}
            >
              <SelectTrigger id="d-location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_LOCATIONS}>Todas as unidades</SelectItem>
                {locs.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-type">Tipo de desconto</Label>
            <Select
              value={f.discount_type}
              onValueChange={(v) => set("discount_type", v as DiscountType)}
            >
              <SelectTrigger id="d-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentual (%)</SelectItem>
                <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-value">Valor do desconto *</Label>
            {f.discount_type === "percent" ? (
              <div className="flex h-12 items-center gap-2 rounded-sm border border-hairline bg-canvas px-3">
                <input
                  id="d-value"
                  type="number"
                  min={1}
                  max={100}
                  value={f.discount_value ?? ""}
                  onChange={(e) => set("discount_value", numOrNull(e.target.value))}
                  className="h-full w-full bg-transparent text-body-md text-ink tabular-nums focus:outline-none"
                  placeholder="20"
                />
                <span className="text-body-sm text-muted">%</span>
              </div>
            ) : (
              <CurrencyInput id="d-value" value={f.discount_value} onChange={(v) => set("discount_value", v)} />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-prio">Prioridade (desempate)</Label>
            <Input
              id="d-prio"
              type="number"
              value={f.priority ?? 0}
              onChange={(e) => set("priority", numOrNull(e.target.value) ?? 0)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-from">Válido a partir de</Label>
            <Input
              id="d-from"
              type="date"
              value={f.valid_from}
              onChange={(e) => set("valid_from", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-until">Válido até</Label>
            <Input
              id="d-until"
              type="date"
              value={f.valid_until}
              onChange={(e) => set("valid_until", e.target.value)}
            />
          </div>

          <div className="tablet:col-span-2">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
              Condições (opcional)
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-minamount">Valor mínimo da reserva</Label>
            <CurrencyInput id="d-minamount" value={f.min_amount} onChange={(v) => set("min_amount", v)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-mindays">Diárias mínimas</Label>
            <Input
              id="d-mindays"
              type="number"
              min={1}
              value={f.min_days ?? ""}
              onChange={(e) => set("min_days", numOrNull(e.target.value))}
              placeholder="Sem mínimo"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-advance">Antecedência mínima (dias)</Label>
            <Input
              id="d-advance"
              type="number"
              min={0}
              value={f.advance_days ?? ""}
              onChange={(e) => set("advance_days", numOrNull(e.target.value))}
              placeholder="Sem mínimo (early-bird)"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3">
              <Switch
                checked={f.allow_coupon_stack}
                onCheckedChange={(v) => set("allow_coupon_stack", v)}
              />
              <span className="text-body-sm text-ink">Permite acumular com cupom</span>
            </label>
          </div>

          {types.length > 0 && (
            <div className="flex flex-col gap-2 tablet:col-span-2">
              <Label>Restringir a tipos de vaga (vazio = todos)</Label>
              <div className="flex flex-wrap gap-3">
                {types.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-body-sm">
                    <input
                      type="checkbox"
                      checked={f.parking_type_ids.includes(t.id)}
                      onChange={() => toggleParkingType(t.id)}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="d-desc">Descrição (interna)</Label>
            <Textarea
              id="d-desc"
              rows={2}
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <label className="flex items-center gap-3 tablet:col-span-2">
            <Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} />
            <span className="text-body-sm text-ink">Ativo</span>
          </label>

          <div className="flex justify-end gap-2 pt-2 tablet:col-span-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
