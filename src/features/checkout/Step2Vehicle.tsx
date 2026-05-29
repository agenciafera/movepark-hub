import * as React from "react";
import { ArrowLeft, ArrowRight, Car, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/context";
import { useCreateVehicle, useMyVehicles } from "@/features/vehicles/api";
import { useUpdateBookingVehicle } from "./api";
import { cn } from "@/lib/utils";

type Props = {
  bookingId: string;
  selectedVehicleId: string | null;
  onBack: () => void;
  onNext: () => void;
};

function plateMask(value: string): string {
  const v = value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 7);
  if (v.length <= 3) return v;
  return `${v.slice(0, 3)}-${v.slice(3)}`;
}

export function Step2Vehicle({ bookingId, selectedVehicleId, onBack, onNext }: Props) {
  const { session } = useAuth();
  const vehiclesQ = useMyVehicles(session?.userId);
  const createVehicle = useCreateVehicle();
  const updateBookingVehicle = useUpdateBookingVehicle();

  const [adding, setAdding] = React.useState(false);
  const [plate, setPlate] = React.useState("");
  const [model, setModel] = React.useState("");
  const [color, setColor] = React.useState("");

  const [selected, setSelected] = React.useState<string | null>(selectedVehicleId);

  React.useEffect(() => {
    // Quando carregar lista, pré-seleciona o primeiro se nada selecionado
    if (!selected && vehiclesQ.data?.length) {
      setSelected(vehiclesQ.data[0].id);
    }
  }, [vehiclesQ.data, selected]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    try {
      const v = await createVehicle.mutateAsync({
        profile_id: session.userId,
        license_plate: plate.trim().toUpperCase(),
        model: model.trim() || undefined,
        color: color.trim() || undefined,
      });
      toast.success("Veículo adicionado");
      setSelected(v.id);
      setAdding(false);
      setPlate("");
      setModel("");
      setColor("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar veículo");
    }
  }

  async function handleNext() {
    if (!selected) {
      toast.error("Escolha um veículo");
      return;
    }
    try {
      await updateBookingVehicle.mutateAsync({
        bookingId,
        vehicleId: selected,
      });
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao vincular veículo");
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-display-sm text-ink">Veículo</h2>
        <p className="text-body-md text-muted">
          Selecione o veículo que vai usar essa vaga.
        </p>
      </div>

      {vehiclesQ.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <ul className="space-y-2">
          {vehiclesQ.data?.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => setSelected(v.id)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-md border bg-canvas p-4 text-left transition-colors",
                  selected === v.id
                    ? "border-mp-navy ring-1 ring-mp-navy"
                    : "border-hairline hover:bg-surface-soft",
                )}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                  <Car className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <div className="text-title-md text-ink">{v.license_plate}</div>
                  <div className="text-body-sm text-muted">
                    {[v.model, v.color].filter(Boolean).join(" · ") ||
                      "Sem detalhes"}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form
          onSubmit={handleAdd}
          className="space-y-4 rounded-md border border-hairline bg-canvas p-5"
        >
          <h3 className="text-title-md text-ink">Adicionar veículo</h3>
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
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
            <div className="flex flex-col gap-1.5 tablet:col-span-2">
              <Label htmlFor="color">Cor</Label>
              <Input
                id="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Prata"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAdding(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createVehicle.isPending || !plate}>
              {createVehicle.isPending ? "Salvando…" : "Salvar veículo"}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Adicionar outro veículo
        </Button>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button
          onClick={handleNext}
          disabled={!selected || updateBookingVehicle.isPending}
        >
          {updateBookingVehicle.isPending ? "Salvando…" : "Continuar"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
