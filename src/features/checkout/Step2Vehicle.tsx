import * as React from "react";
import { ArrowLeft, ArrowRight, Car, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AccessibilityIcon } from "@/components/shared/AccessibilityIcon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/context";
import { useCreateVehicle, useMyVehicles } from "@/features/vehicles/api";
import { PlateLookupField, type ConfirmedVehicle } from "@/features/vehicles/PlateLookupField";
import { plateMask } from "@/lib/masks";
import { useUpdateBookingVehicle, useUpdateBookingTrip } from "./api";
import { cn } from "@/lib/utils";

type Props = {
  bookingId: string;
  selectedVehicleId: string | null;
  passengerCount: number | null;
  hasPcd: boolean;
  onBack: () => void;
  onNext: () => void;
};

export function Step2Vehicle({
  bookingId,
  selectedVehicleId,
  passengerCount,
  hasPcd,
  onBack,
  onNext,
}: Props) {
  const { session } = useAuth();
  const vehiclesQ = useMyVehicles(session?.userId);
  const createVehicle = useCreateVehicle();
  const updateBookingVehicle = useUpdateBookingVehicle();
  const updateBookingTrip = useUpdateBookingTrip();

  const [adding, setAdding] = React.useState(false);
  const [addMode, setAddMode] = React.useState<"lookup" | "manual">("lookup");
  const [plate, setPlate] = React.useState("");
  const [model, setModel] = React.useState("");
  const [color, setColor] = React.useState("");

  const [selected, setSelected] = React.useState<string | null>(selectedVehicleId);
  const [passengers, setPassengers] = React.useState<string>(
    passengerCount != null ? String(passengerCount) : "",
  );
  const [pcd, setPcd] = React.useState(hasPcd);

  React.useEffect(() => {
    if (!selected && vehiclesQ.data?.length) {
      setSelected(vehiclesQ.data[0].id);
    }
  }, [vehiclesQ.data, selected]);

  function resetAddForm() {
    setAdding(false);
    setAddMode("lookup");
    setPlate("");
    setModel("");
    setColor("");
  }

  async function handleAdd() {
    if (!session) return;
    if (!plate.trim()) {
      toast.error("Informe a placa do veículo");
      return;
    }
    try {
      const v = await createVehicle.mutateAsync({
        profile_id: session.userId,
        license_plate: plate.trim().toUpperCase(),
        model: model.trim() || undefined,
        color: color.trim() || undefined,
      });
      toast.success("Veículo adicionado");
      setSelected(v.id);
      resetAddForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar veículo");
    }
  }

  async function handleConfirmLookup(data: ConfirmedVehicle) {
    if (!session) return;
    try {
      const v = await createVehicle.mutateAsync({
        profile_id: session.userId,
        license_plate: plateMask(data.license_plate),
        model: data.model ?? undefined,
        color: data.color ?? undefined,
      });
      toast.success("Veículo adicionado");
      setSelected(v.id);
      resetAddForm();
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
      const passNum = passengers.trim() ? Number(passengers) : null;
      await Promise.all([
        updateBookingVehicle.mutateAsync({ bookingId, vehicleId: selected }),
        updateBookingTrip.mutateAsync({ bookingId, passenger_count: passNum, has_pcd: pcd }),
      ]);
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar veículo");
    }
  }

  const busy = updateBookingVehicle.isPending || updateBookingTrip.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await handleNext();
  }

  return (
    <form id="checkout-step-form" onSubmit={handleSubmit} className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-body-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </button>

      <div className="space-y-2">
        <h2 className="text-display-sm text-ink">Veículo</h2>
        <p className="text-body-md text-muted">Selecione o veículo que vai usar essa vaga.</p>
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
                aria-pressed={selected === v.id}
                className={cn(
                  "flex w-full items-center gap-4 rounded-md border bg-canvas p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
                  selected === v.id
                    ? "border-mp-primary ring-1 ring-mp-primary"
                    : "border-hairline hover:bg-surface-soft",
                )}
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                  <Car className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-title-md text-ink">{v.license_plate}</div>
                  <div className="text-body-sm text-muted">
                    {[v.model, v.color].filter(Boolean).join(" · ") || "Sem detalhes"}
                  </div>
                </div>
                {selected === v.id && (
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mp-primary text-white">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="space-y-4 rounded-md border border-hairline bg-canvas p-5">
          <h3 className="text-title-md text-ink">Adicionar veículo</h3>
          {addMode === "lookup" ? (
            <PlateLookupField
              onConfirm={handleConfirmLookup}
              onManual={(p) => {
                setPlate(p);
                setAddMode("manual");
              }}
              confirming={createVehicle.isPending}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="plate">Placa</Label>
                  <Input
                    id="plate"
                    value={plate}
                    onChange={(e) => setPlate(plateMask(e.target.value))}
                    placeholder="ABC-1D23"
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
                <Button type="button" variant="ghost" onClick={() => setAddMode("lookup")}>
                  Voltar à consulta
                </Button>
                <Button
                  type="button"
                  onClick={handleAdd}
                  disabled={createVehicle.isPending || !plate}
                >
                  {createVehicle.isPending ? "Salvando…" : "Salvar veículo"}
                </Button>
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={resetAddForm}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            setAddMode("lookup");
            setAdding(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Adicionar veículo
        </Button>
      )}

      <div className="space-y-4 rounded-md border border-hairline bg-canvas p-5">
        <h3 className="text-title-md text-ink">Dados da viagem</h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="passengers">Passageiros no transfer</Label>
          <div className="flex items-center gap-3">
            <Input
              id="passengers"
              type="number"
              min={1}
              max={7}
              value={passengers}
              onChange={(e) => setPassengers(e.target.value)}
              placeholder="1"
              className="w-20"
            />
            <span className="text-body-sm text-muted">
              Quantas pessoas vão usar o serviço de transfer.
            </span>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={pcd}
            onChange={(e) => setPcd(e.target.checked)}
            className="h-4 w-4 shrink-0 rounded border-hairline accent-mp-indigo"
          />
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
            <AccessibilityIcon className="h-5 w-5" />
          </span>
          <span className="text-body-md text-ink">
            Uma ou mais pessoas precisam de assistência especial no embarque ou desembarque
          </span>
        </label>
      </div>

      {/* Botão desktop — no mobile a barra fixa do checkout.tsx submete o form */}
      <div className="hidden justify-end desktop:flex">
        <Button type="submit" disabled={!selected || busy}>
          {busy ? "Salvando…" : "Continuar"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
