import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/ui/currency-input";
import type { AddOnService } from "@/types/domain";
import { useUpsertAddon } from "./api";
import { buildAddonUpsertArgs, validateAddonForm, type AddonFormValues } from "./addons.logic";

type Props = {
  open: boolean;
  companyId: string;
  addon: AddOnService | null;
  onOpenChange: (open: boolean) => void;
};

const EMPTY: AddonFormValues = {
  name: "",
  description: "",
  base_price: null,
  is_active: true,
  sort_order: 0,
};

export function AddonForm({ open, companyId, addon, onOpenChange }: Props) {
  const upsert = useUpsertAddon(companyId);
  const isEdit = !!addon;
  const [f, setF] = React.useState<AddonFormValues>(EMPTY);

  React.useEffect(() => {
    if (!open) return;
    setF(
      addon
        ? {
            name: addon.name,
            description: addon.description ?? "",
            base_price: Number(addon.base_price),
            is_active: addon.is_active,
            sort_order: addon.sort_order,
          }
        : EMPTY,
    );
  }, [open, addon]);

  function set<K extends keyof AddonFormValues>(k: K, v: AddonFormValues[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateAddonForm(f);
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await upsert.mutateAsync(buildAddonUpsertArgs(companyId, addon?.id ?? null, f));
      toast.success(isEdit ? "Serviço atualizado" : "Serviço criado");
      onOpenChange(false);
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Erro ao salvar serviço");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar serviço" : "Novo serviço adicional"}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="a-name">Nome *</Label>
            <Input
              id="a-name"
              required
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ex: Lava-jato"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="a-desc">Descrição</Label>
            <Textarea
              id="a-desc"
              rows={2}
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Detalhes opcionais exibidos ao cliente."
            />
          </div>
          <div className="flex items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Preço base *</Label>
              <CurrencyInput
                value={f.base_price}
                onChange={(v) => set("base_price", v)}
                className="w-36"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="a-sort">Ordem</Label>
              <Input
                id="a-sort"
                type="number"
                min={0}
                value={f.sort_order ?? 0}
                onChange={(e) => set("sort_order", e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-24"
              />
            </div>
          </div>
          <label className="flex items-center gap-3">
            <Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} />
            <span className="text-body-sm text-ink">Ativo no catálogo</span>
          </label>

          <p className="text-caption text-muted">
            O preço base vale para todas as unidades. Você pode habilitar o serviço e ajustar o
            preço por unidade depois, em “Disponibilidade”.
          </p>

          <div className="flex justify-end gap-2 pt-2">
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
