import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLookupPlate } from "./api";

export type PlateChangeValues = {
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  reason: string;
};

/**
 * Troca de placa pela equipe, igual para reserva do Hub e do site (fase 6 das reservas unificadas):
 * placa nova, "Consultar" preenche modelo e cor pela consulta de placa (Edge lookup-vehicle-plate,
 * a mesma do cadastro do cliente), e motivo obrigatório, como no backoffice do white-label. Se a
 * consulta não acha, modelo e cor ficam para digitar.
 */
export function PlateChangeForm({
  onSubmit,
  onCancel,
  pending,
  idPrefix = "troca-placa",
}: {
  onSubmit: (v: PlateChangeValues) => void;
  onCancel: () => void;
  pending: boolean;
  idPrefix?: string;
}) {
  const lookup = useLookupPlate();
  const [plate, setPlate] = React.useState("");
  const [brand, setBrand] = React.useState<string | null>(null);
  const [model, setModel] = React.useState("");
  const [color, setColor] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [aviso, setAviso] = React.useState<string | null>(null);

  async function consultar() {
    setAviso(null);
    try {
      const r = await lookup.mutateAsync(plate.trim());
      if (r.found && r.vehicle) {
        setBrand(r.vehicle.brand);
        setModel(r.vehicle.model ?? "");
        setColor(r.vehicle.color ?? "");
      } else {
        setAviso("Não achamos essa placa. Preencha o modelo e a cor.");
      }
    } catch (e) {
      setAviso(
        e instanceof Error ? e.message : "A consulta não respondeu. Preencha o modelo e a cor.",
      );
    }
  }

  const podeSalvar = plate.trim().length >= 7 && reason.trim().length > 0 && !pending;

  return (
    <div className="flex max-w-md flex-col gap-3" data-testid="form-troca-placa">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-placa`}>Nova placa</Label>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}-placa`}
            value={plate}
            onChange={(e) => {
              setPlate(e.target.value.toUpperCase());
              setBrand(null);
            }}
            placeholder="ABC1D23"
            className="h-9 flex-1 uppercase"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={consultar}
            disabled={plate.trim().length < 7 || lookup.isPending}
          >
            {lookup.isPending ? "Consultando..." : "Consultar"}
          </Button>
        </div>
        {aviso && <p className="text-caption text-muted">{aviso}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-modelo`}>Modelo</Label>
          <Input
            id={`${idPrefix}-modelo`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-cor`}>Cor</Label>
          <Input
            id={`${idPrefix}-cor`}
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-motivo`}>Motivo</Label>
        <Textarea
          id={`${idPrefix}-motivo`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!podeSalvar}
          onClick={() =>
            onSubmit({
              plate: plate.trim(),
              brand,
              model: model.trim() || null,
              color: color.trim() || null,
              reason: reason.trim(),
            })
          }
        >
          {pending ? "Salvando..." : "Salvar placa"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
