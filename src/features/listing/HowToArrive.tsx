import { AlertTriangle, Bus } from "lucide-react";
import { MiniMap } from "./MiniMap";
import { formatShuttle } from "./howToArrive.logic";

type Props = {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Aviso crítico de entrada (PRD-11: o `notice` vira o alerta "o GPS erra a entrada"). */
  notice: string | null;
  hasNotice: boolean;
  /** Passo-a-passo de chegada (markdown leve; renderizado preservando quebras). */
  directionsText: string | null;
  shuttleFrequencyMinutes: number | null;
  shuttleToTerminalMinutes: number | null;
};

/**
 * Conteúdo do bloco "Como chegar" (PRD-11). O ONDE (endereço + mapa) já existia; aqui entram
 * o COMO — aviso crítico de entrada, passo-a-passo e o traslado honesto (frequência + tempo).
 * Componente puro: a distância por terminal (DAT-04) é renderizada à parte em `listing.tsx`.
 */
export function HowToArrive({
  address,
  latitude,
  longitude,
  notice,
  hasNotice,
  directionsText,
  shuttleFrequencyMinutes,
  shuttleToTerminalMinutes,
}: Props) {
  const shuttle = formatShuttle({
    frequencyMinutes: shuttleFrequencyMinutes,
    toTerminalMinutes: shuttleToTerminalMinutes,
  });

  return (
    <div className="space-y-4">
      {hasNotice && notice && (
        <div
          role="alert"
          className="flex gap-3 rounded-md border border-error bg-badge-cancelled-bg p-3"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-error" />
          <p className="text-body-sm text-ink">{notice}</p>
        </div>
      )}

      {directionsText && (
        <p className="whitespace-pre-line text-body-md text-body">{directionsText}</p>
      )}

      {shuttle && (
        <div className="flex items-center gap-2 text-body-md text-ink">
          <Bus className="h-4 w-4 shrink-0 text-muted" />
          <span>
            <strong>Transfer:</strong> {shuttle}
          </span>
        </div>
      )}

      <MiniMap address={address} latitude={latitude} longitude={longitude} />
    </div>
  );
}
