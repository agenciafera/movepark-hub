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
import type { CouponWithRestrictions, DiscountType } from "@/types/domain";
import { useCompanyParkingTypes, useUpsertCoupon } from "./api";
import {
  buildCouponUpsertArgs,
  EMPTY_COUPON_FORM,
  isoToDateInput,
  validateCouponForm,
  type CouponFormValues,
} from "./coupons.logic";

type Props = {
  open: boolean;
  companyId: string;
  coupon: CouponWithRestrictions | null;
  onOpenChange: (open: boolean) => void;
};

function numOrNull(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

export function CouponForm({ open, companyId, coupon, onOpenChange }: Props) {
  const upsert = useUpsertCoupon(companyId);
  const parkingTypes = useCompanyParkingTypes(open ? companyId : undefined);
  const isEdit = !!coupon;
  const [f, setF] = React.useState<CouponFormValues>(EMPTY_COUPON_FORM);

  React.useEffect(() => {
    if (!open) return;
    setF(
      coupon
        ? {
            code: coupon.code,
            description: coupon.description ?? "",
            discount_type: coupon.discount_type,
            discount_value: Number(coupon.discount_value),
            valid_from: isoToDateInput(coupon.valid_from),
            valid_until: isoToDateInput(coupon.valid_until),
            max_uses: coupon.max_uses,
            is_active: coupon.is_active,
            sort_order: coupon.sort_order,
            per_user_limit: coupon.per_user_limit,
            min_amount: coupon.min_amount != null ? Number(coupon.min_amount) : null,
            min_days: coupon.min_days,
            parking_type_ids: coupon.parking_type_ids,
          }
        : EMPTY_COUPON_FORM,
    );
  }, [open, coupon]);

  function set<K extends keyof CouponFormValues>(k: K, v: CouponFormValues[K]) {
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
    const err = validateCouponForm(f);
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await upsert.mutateAsync(buildCouponUpsertArgs(companyId, coupon?.id ?? null, f));
      toast.success(isEdit ? "Cupom atualizado" : "Cupom criado");
      onOpenChange(false);
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Erro ao salvar cupom");
    }
  }

  const types = parkingTypes.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cupom" : "Novo cupom"}</DialogTitle>
        </DialogHeader>
        <form className="grid grid-cols-1 gap-4 tablet:grid-cols-2" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-code">Código *</Label>
            <Input
              id="c-code"
              required
              value={f.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="PROMO10"
              className="uppercase"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tipo de desconto</Label>
            <Select
              value={f.discount_type}
              onValueChange={(v) => set("discount_type", v as DiscountType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentual (%)</SelectItem>
                <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-value">Valor do desconto *</Label>
            {f.discount_type === "percent" ? (
              <div className="flex h-12 items-center gap-2 rounded-sm border border-hairline bg-canvas px-3">
                <input
                  id="c-value"
                  type="number"
                  min={1}
                  max={100}
                  value={f.discount_value ?? ""}
                  onChange={(e) => set("discount_value", numOrNull(e.target.value))}
                  className="h-full w-full bg-transparent text-body-md text-ink tabular-nums focus:outline-none"
                  placeholder="10"
                />
                <span className="text-body-sm text-muted">%</span>
              </div>
            ) : (
              <CurrencyInput
                value={f.discount_value}
                onChange={(v) => set("discount_value", v)}
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-max">Limite total de usos</Label>
            <Input
              id="c-max"
              type="number"
              min={1}
              value={f.max_uses ?? ""}
              onChange={(e) => set("max_uses", numOrNull(e.target.value))}
              placeholder="Ilimitado"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-from">Válido a partir de</Label>
            <Input
              id="c-from"
              type="date"
              value={f.valid_from}
              onChange={(e) => set("valid_from", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-until">Válido até</Label>
            <Input
              id="c-until"
              type="date"
              value={f.valid_until}
              onChange={(e) => set("valid_until", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="c-desc">Descrição (interna)</Label>
            <Textarea
              id="c-desc"
              rows={2}
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Para que serve este cupom."
            />
          </div>

          <div className="tablet:col-span-2">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
              Elegibilidade (opcional)
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-minamount">Valor mínimo da reserva</Label>
            <CurrencyInput
              value={f.min_amount}
              onChange={(v) => set("min_amount", v)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-mindays">Diárias mínimas</Label>
            <Input
              id="c-mindays"
              type="number"
              min={1}
              value={f.min_days ?? ""}
              onChange={(e) => set("min_days", numOrNull(e.target.value))}
              placeholder="Sem mínimo"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-peruser">Limite por usuário</Label>
            <Input
              id="c-peruser"
              type="number"
              min={1}
              value={f.per_user_limit ?? ""}
              onChange={(e) => set("per_user_limit", numOrNull(e.target.value))}
              placeholder="Ilimitado"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-sort">Ordem</Label>
            <Input
              id="c-sort"
              type="number"
              min={0}
              value={f.sort_order ?? 0}
              onChange={(e) => set("sort_order", numOrNull(e.target.value) ?? 0)}
            />
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
