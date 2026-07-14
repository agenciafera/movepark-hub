import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateLocationParkingType, type LocationParkingTypeWithRelations } from "./api";
import {
  buildCapacityRulesPatch,
  capacityRulesFromLpt,
  MIN_STAY_UNITS,
  validateCapacityRules,
  type CapacityRulesValues,
} from "./capacity-rules.logic";
import type { MinimumStayUnit } from "@/types/domain";

type Props = {
  open: boolean;
  lpt: LocationParkingTypeWithRelations;
  onOpenChange: (open: boolean) => void;
};

export function CapacityRulesForm({ open, lpt, onOpenChange }: Props) {
  const update = useUpdateLocationParkingType();
  const [values, setValues] = React.useState<CapacityRulesValues>(() => capacityRulesFromLpt(lpt));

  React.useEffect(() => {
    if (open) setValues(capacityRulesFromLpt(lpt));
  }, [open, lpt]);

  function set<K extends keyof CapacityRulesValues>(key: K, v: CapacityRulesValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function save() {
    const err = validateCapacityRules(values);
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await update.mutateAsync({ id: lpt.id, patch: buildCapacityRulesPatch(values) });
      toast.success("Regras de reserva atualizadas");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Regras de reserva</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Quase-lotação */}
          <div className="space-y-2">
            <Label htmlFor="near-threshold">Avisar quando restarem ≤ N vagas</Label>
            <Input
              id="near-threshold"
              type="number"
              min={0}
              placeholder="Sem aviso"
              value={values.near_capacity_threshold}
              onChange={(e) => set("near_capacity_threshold", e.target.value)}
              className="h-10 w-32 tabular-nums"
            />
            <Label htmlFor="near-message">Mensagem de quase-lotação (opcional)</Label>
            <Textarea
              id="near-message"
              placeholder="Ex.: Últimas vagas para esta data."
              value={values.near_capacity_message}
              onChange={(e) => set("near_capacity_message", e.target.value)}
              rows={2}
            />
          </div>

          {/* Estadia mínima */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="has-min-stay">Exigir estadia mínima</Label>
              <Switch
                id="has-min-stay"
                checked={values.has_minimum_stay}
                onCheckedChange={(v) => set("has_minimum_stay", v)}
              />
            </div>
            {values.has_minimum_stay && (
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  value={values.minimum_stay_value}
                  onChange={(e) => set("minimum_stay_value", e.target.value)}
                  className="h-10 w-24 tabular-nums"
                />
                <Select
                  value={values.minimum_stay_unit}
                  onValueChange={(v) => set("minimum_stay_unit", v as MinimumStayUnit)}
                >
                  <SelectTrigger className="h-10 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MIN_STAY_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Data mínima */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="has-min-date">Exigir data mínima de entrada</Label>
              <Switch
                id="has-min-date"
                checked={values.has_minimum_date}
                onCheckedChange={(v) => set("has_minimum_date", v)}
              />
            </div>
            {values.has_minimum_date && (
              <Input
                type="date"
                value={values.minimum_date}
                onChange={(e) => set("minimum_date", e.target.value)}
                className="h-10 w-44"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={update.isPending}>
              {update.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
