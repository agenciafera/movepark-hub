import { AlertCircle, Car, Check, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlateLookupFlow } from "./usePlateLookupFlow";

export type ConfirmedVehicle = {
  license_plate: string;
  model: string | null;
  color: string | null;
};

type Props = {
  /** Chamado ao confirmar o veículo encontrado ("Prosseguir"). */
  onConfirm: (data: ConfirmedVehicle) => void | Promise<void>;
  /** Chamado ao optar por cadastro manual — recebe a placa digitada pra pré-preencher. */
  onManual: (plate: string) => void;
  /** Pai está salvando (desabilita o botão e mostra "Cadastrando…"). */
  confirming?: boolean;
};

/**
 * Campo de placa com consulta automática ao serviço externo. Ao completar uma placa válida,
 * consulta sozinho; se achar, mostra os dados em leitura e pede confirmação; se não achar
 * (ou erro), oferece cadastro manual ou nova consulta.
 */
export function PlateLookupField({ onConfirm, onManual, confirming }: Props) {
  const flow = usePlateLookupFlow();
  const { plate, setPlate, status, vehicle, error } = flow;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plate-lookup">Placa</Label>
        <div className="relative">
          <Input
            id="plate-lookup"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="ABC-1D23"
            autoComplete="off"
            inputMode="text"
            disabled={status === "found" || confirming}
          />
          {status === "looking_up" && (
            <Loader2
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted"
              aria-label="Consultando placa"
            />
          )}
        </div>
        {status === "idle" && (
          <p className="text-body-sm text-muted">Digite a placa que a gente busca os dados pra você.</p>
        )}
        {status === "looking_up" && (
          <p className="text-body-sm text-muted">Consultando a placa…</p>
        )}
      </div>

      {/* Encontrado → card de confirmação (leitura) */}
      {status === "found" && vehicle && (
        <div className="space-y-4 rounded-md border border-mp-primary bg-mp-pale/40 p-5">
          <div className="flex items-center gap-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
              <Car className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-title-md text-ink">{vehicle.license_plate}</div>
              <div className="text-body-sm text-muted">
                {[vehicle.model, vehicle.color, vehicle.year].filter(Boolean).join(" · ") ||
                  "Sem detalhes"}
              </div>
            </div>
          </div>
          <p className="text-body-md text-ink">É esse veículo?</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={flow.reset} disabled={confirming}>
              Não é esse
            </Button>
            <Button
              type="button"
              disabled={confirming}
              onClick={() =>
                onConfirm({
                  license_plate: vehicle.license_plate,
                  model: vehicle.model,
                  color: vehicle.color,
                })
              }
            >
              {confirming ? (
                "Cadastrando…"
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Prosseguir
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Não encontrado / erro → manual ou nova consulta */}
      {(status === "not_found" || status === "error") && (
        <div className="space-y-3 rounded-md border border-hairline bg-surface-soft p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-body-sm text-ink">
              {status === "error"
                ? (error ?? "Não deu pra consultar a placa agora.")
                : "Não encontramos essa placa. Pode ter erro de digitação ou ser um veículo novo, fora da base."}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={flow.retry}>
              <Search className="h-4 w-4" />
              Consultar de novo
            </Button>
            <Button type="button" onClick={() => onManual(plate)}>
              Cadastrar manualmente
            </Button>
          </div>
        </div>
      )}

      {/* Ocioso → atalho pro manual (placa nova / sem consulta) */}
      {status === "idle" && (
        <button
          type="button"
          onClick={() => onManual(plate)}
          className="text-body-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Prefiro cadastrar manualmente
        </button>
      )}
    </div>
  );
}
