// Registro de clique de saída da unidade externa (E0.16).
//
// A reserva da unidade externa nasce no site do parceiro, então não existe `booking` para
// ancorar métrica. Este é o único ponto do funil que o Hub consegue observar.
//
// **A regra que manda em tudo aqui: o registro não pode atrasar o redirect.** Um clique perdido
// é aceitável, um redirect lento não é. Por isso nada de `await` antes de navegar, nada de
// `preventDefault`, e falha de rede é engolida de propósito.

import { getAnonSessionId } from "@/lib/anonSession";
import { getStoredUtm } from "@/lib/utm";

/** Corpo da RPC `log_external_exit`. Nomes espelham os parâmetros do Postgres. */
export type ExitClickPayload = {
  p_location_parking_type_id: string;
  p_session_id: string;
  p_check_in_at: string | null;
  p_check_out_at: string | null;
  p_utm_source: string | null;
  p_utm_medium: string | null;
  p_utm_campaign: string | null;
};

/**
 * Monta o corpo do evento, ou devolve null quando não há o que registrar.
 *
 * Separado do envio para ser testável sem rede: o que importa provar é que o payload não carrega
 * PII e que a ausência de sessão anônima cancela o registro em vez de inventar um id.
 */
export function buildExitClickPayload(args: {
  locationParkingTypeId: string | null | undefined;
  sessionId: string | null;
  from: Date | null;
  to: Date | null;
  utm: { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null };
}): ExitClickPayload | null {
  if (!args.locationParkingTypeId || !args.sessionId) return null;

  const iso = (d: Date | null) =>
    d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;

  return {
    p_location_parking_type_id: args.locationParkingTypeId,
    p_session_id: args.sessionId,
    p_check_in_at: iso(args.from),
    p_check_out_at: iso(args.to),
    p_utm_source: args.utm.utm_source,
    p_utm_medium: args.utm.utm_medium,
    p_utm_campaign: args.utm.utm_campaign,
  };
}

/**
 * Envia o evento sem segurar a navegação.
 *
 * `keepalive` é o ponto: ele autoriza o navegador a terminar a requisição depois que a página já
 * saiu. Um `fetch` comum é cancelado no unload e o clique se perde justamente nos casos que mais
 * importam, que são os que realmente saíram. Preferido ao `sendBeacon` porque este não deixa
 * definir cabeçalho, e o PostgREST exige `apikey` e `Content-Type`.
 *
 * Não devolve promessa de propósito: quem chama não tem o que esperar, e um `await` aqui seria o
 * bug que este arquivo inteiro existe para não ter.
 */
export function sendExitClick(payload: ExitClickPayload): void {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey || typeof fetch !== "function") return;

  void fetch(`${url}/rest/v1/rpc/log_external_exit`, {
    method: "POST",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Silêncio proposital. Métrica que quebra a saída do cliente é pior que métrica faltando.
  });
}

/** Junta as duas metades: lê sessão e UTM do navegador, monta e dispara. */
export function recordExitClick(args: {
  locationParkingTypeId: string | null | undefined;
  from: Date | null;
  to: Date | null;
}): void {
  const payload = buildExitClickPayload({
    ...args,
    sessionId: getAnonSessionId(),
    utm: getStoredUtm(),
  });
  if (payload) sendExitClick(payload);
}
