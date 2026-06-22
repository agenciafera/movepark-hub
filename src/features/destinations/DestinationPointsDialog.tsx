import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDestinationPoints,
  useCreateDestinationPoint,
  useUpdateDestinationPoint,
  useDeleteDestinationPoint,
} from "./api";
import type { Destination, DestinationPoint } from "@/types/domain";

/** Tipos de ponto — alinhados ao CHECK da coluna destination_point.type. */
const POINT_TYPES = [
  { value: "terminal", label: "Terminal" },
  { value: "gate", label: "Portão" },
  { value: "pier", label: "Píer" },
  { value: "platform", label: "Plataforma" },
  { value: "other", label: "Outro" },
];

type Props = { open: boolean; destination: Destination | null; onOpenChange: (open: boolean) => void };

const EMPTY = { name: "", type: "terminal", latitude: "", longitude: "", sort_order: "100" };

export function DestinationPointsDialog({ open, destination, onOpenChange }: Props) {
  const destinationId = destination?.id;
  const points = useDestinationPoints(open ? destinationId : undefined);
  const create = useCreateDestinationPoint();
  const update = useUpdateDestinationPoint();
  const del = useDeleteDestinationPoint();

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [f, setF] = React.useState(EMPTY);

  React.useEffect(() => {
    if (!open) {
      setEditingId(null);
      setF(EMPTY);
    }
  }, [open]);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  function startEdit(p: DestinationPoint) {
    setEditingId(p.id);
    setF({
      name: p.name,
      type: p.type,
      latitude: String(p.latitude),
      longitude: String(p.longitude),
      sort_order: String(p.sort_order),
    });
  }

  function resetForm() {
    setEditingId(null);
    setF(EMPTY);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!destinationId) return;
    if (!f.name.trim() || !f.latitude || !f.longitude) {
      toast.error("Preencha nome, latitude e longitude.");
      return;
    }
    const base = {
      name: f.name.trim(),
      type: f.type,
      latitude: Number(f.latitude),
      longitude: Number(f.longitude),
      sort_order: Number(f.sort_order || 100),
    };
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, patch: base });
        toast.success("Ponto atualizado");
      } else {
        await create.mutateAsync({ destination_id: destinationId, ...base });
        toast.success("Ponto adicionado");
      }
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar ponto");
    }
  }

  async function remove(p: DestinationPoint) {
    if (!destinationId) return;
    if (!confirm(`Excluir o ponto "${p.name}"?`)) return;
    try {
      await del.mutateAsync({ id: p.id, destinationId });
      if (editingId === p.id) resetForm();
      toast.success("Ponto excluído");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  const list = points.data ?? [];
  const submitting = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Terminais{destination ? ` · ${destination.short_name ?? destination.name}` : ""}
          </DialogTitle>
        </DialogHeader>

        <p className="text-body-sm text-muted">
          Pontos físicos do destino (T1/T2/T3, píer, plataforma). A distância lote → terminal é
          calculada por haversine — sem API. Aeroporto de um terminal só não precisa de pontos.
        </p>

        {!destinationId ? (
          <p className="text-body-sm text-muted">Salve o destino antes de adicionar terminais.</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {points.isLoading ? (
                <p className="text-body-sm text-muted">Carregando…</p>
              ) : list.length === 0 ? (
                <p className="text-body-sm text-muted">Nenhum terminal cadastrado.</p>
              ) : (
                list.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-md border border-hairline px-3 py-2"
                  >
                    <div className="text-body-sm">
                      <span className="font-medium text-ink">{p.name}</span>{" "}
                      <span className="text-muted">
                        · {p.type} · {p.latitude}, {p.longitude}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(p)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(p)}
                        disabled={del.isPending}
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              className="grid grid-cols-1 gap-3 border-t border-hairline pt-4 tablet:grid-cols-2"
              onSubmit={handleSubmit}
            >
              <div className="text-body-sm font-medium text-ink tablet:col-span-2">
                {editingId ? "Editar terminal" : "Adicionar terminal"}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-name">Nome *</Label>
                <Input
                  id="p-name"
                  value={f.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Terminal 2"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Tipo</Label>
                <Select value={f.type} onValueChange={(v) => set("type", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POINT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-lat">Latitude *</Label>
                <Input
                  id="p-lat"
                  inputMode="decimal"
                  value={f.latitude}
                  onChange={(e) => set("latitude", e.target.value)}
                  placeholder="-23.4327"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-lng">Longitude *</Label>
                <Input
                  id="p-lng"
                  inputMode="decimal"
                  value={f.longitude}
                  onChange={(e) => set("longitude", e.target.value)}
                  placeholder="-46.4730"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-sort">Ordem</Label>
                <Input
                  id="p-sort"
                  type="number"
                  value={f.sort_order}
                  onChange={(e) => set("sort_order", e.target.value)}
                />
              </div>
              <div className="flex items-end justify-end gap-2">
                {editingId && (
                  <Button type="button" variant="secondary" onClick={resetForm}>
                    Cancelar
                  </Button>
                )}
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Salvando…" : editingId ? "Salvar" : "Adicionar"}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
