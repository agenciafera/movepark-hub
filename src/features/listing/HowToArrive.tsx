import { Bus, Warning } from "@phosphor-icons/react";
import { Go2ParkPageCredit, Go2ParkVanContact } from "@/features/go2park/Go2ParkLive";
import { MiniMap } from "./MiniMap";
import { formatShuttle } from "./howToArrive.logic";

type Props = {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Place ID do Google da unidade, quando cadastrado. Repassado ao mapa. */
  placeId?: string | null;
  /** Aviso crítico de entrada (PRD-11: o `notice` vira o alerta "o GPS erra a entrada"). */
  notice: string | null;
  hasNotice: boolean;
  /** Passo-a-passo de chegada (markdown leve; renderizado preservando quebras). */
  directionsText: string | null;
  shuttleFrequencyMinutes: number | null;
  shuttleToTerminalMinutes: number | null;
  /**
   * A unidade opera o transfer com a Go2Park (rastreio da van em tempo real). O crédito entra
   * aqui, logo depois da frequência do transfer, porque é a mesma pergunta do cliente: como eu
   * saio daqui e chego no terminal. Fato da unidade, então não passa por capacidade (ADR-009).
   */
  go2park?: boolean;
  /** WhatsApp da van (E.164). Sem ele não há botão de contato, só o crédito. */
  go2parkWhatsapp?: string | null;
  /** Empresa e unidade nomeiam o contato salvo na agenda ("Van Virapark · Viracopos"). */
  companyName?: string | null;
  locationName?: string | null;
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
  placeId,
  notice,
  hasNotice,
  directionsText,
  shuttleFrequencyMinutes,
  shuttleToTerminalMinutes,
  go2park = false,
  go2parkWhatsapp,
  companyName,
  locationName,
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
          <Warning className="mt-0.5 h-5 w-5 shrink-0 text-error" />
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

      {/* Crédito do parceiro entre o acesso e o endereço: responde "quem opera a van" no ponto
          em que o cliente está montando a chegada, sem virar oferta no meio da página. */}
      {go2park && (
        <>
          <Go2ParkPageCredit />
          <Go2ParkVanContact
            whatsapp={go2parkWhatsapp}
            companyName={companyName}
            locationName={locationName}
          />
        </>
      )}

      <MiniMap address={address} latitude={latitude} longitude={longitude} placeId={placeId} />
    </div>
  );
}
