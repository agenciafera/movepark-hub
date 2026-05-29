import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/auth/context";
import {
  useCreateVehicle,
  useUpdateVehicle,
  type Vehicle,
} from "./api";

function plateMask(value: string): string {
  const v = value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 7);
  if (v.length <= 3) return v;
  return `${v.slice(0, 3)}-${v.slice(3)}`;
}

const colorOptions = [
  "Branco",
  "Preto",
  "Prata",
  "Cinza",
  "Vermelho",
  "Azul",
  "Verde",
  "Marrom",
  "Outro",
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle | null;
};

export function VehicleForm({ open, onOpenChange, vehicle }: Props) {
  const { session } = useAuth();
  const create = useCreateVehicle();
  const update = useUpdateVehicle();
  const editing = !!vehicle;

  const [plate, setPlate] = React.useState("");
  const [model, setModel] = React.useState("");
  const [color, setColor] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPlate(vehicle?.license_plate ?? "");
    setModel(vehicle?.model ?? "");
    setColor(vehicle?.color ?? "");
    setIsDefault(vehicle?.is_default ?? false);
  }, [open, vehicle]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    try {
      if (editing && vehicle) {
        await update.mutateAsync({
          id: vehicle.id,
          profileId: session.userId,
          patch: {
            license_plate: plate.trim().toUpperCase(),
            model: model.trim() || null,
            color: color || null,
            is_default: isDefault,
          },
        });
        toast.success("Veículo atualizado");
      } else {
        await create.mutateAsync({
          profile_id: session.userId,
          license_plate: plate.trim().toUpperCase(),
          model: model.trim() || undefined,
          color: color || undefined,
          is_default: isDefault,
        });
        toast.success("Veículo adicionado");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const submitting = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar veículo" : "Novo veículo"}</DialogTitle>
          <DialogDescription>
            Cadastre a placa e detalhes pra usar nas reservas.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plate">Placa</Label>
            <Input
              id="plate"
              value={plate}
              onChange={(e) => setPlate(plateMask(e.target.value))}
              placeholder="ABC-1D23"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model">Modelo</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Honda Civic"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cor</Label>
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {colorOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2.5 text-body-sm">
            <Checkbox
              id="default"
              checked={isDefault}
              onCheckedChange={(v) => setIsDefault(v === true)}
            />
            Marcar como veículo padrão
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !plate}>
              {submitting ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
