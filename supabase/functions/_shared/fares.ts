// Tarifas (Básica / Flex / Superflex): o que o agente diz sobre cada uma (tool `list_fares`).
//
// Os rótulos dos benefícios moram em `src/lib/fares.ts` (FARE_BENEFIT_LABELS), "fonte única da
// promessa" do site. Deno não importa do front, então este arquivo é um ESPELHO, e o teste
// `src/lib/fares.contract.test.ts` reprova se os dois divergirem. Mudou a copy lá, muda aqui.
//
// O catálogo (preço, janela, quais benefícios cada tarifa tem) é a verdade do banco (`fare`, RPC
// `get_unit_fares`). Aqui só a apresentação, igual ao comparativo do site (fareMatrix.logic.ts):
// cancelamento vira uma linha pela janela, e benefício que nenhuma tarifa tem não aparece.

export type FareBenefitKey =
  | "free_cancellation"
  | "email_confirmation"
  | "guaranteed_spot"
  | "plate_change"
  | "date_change"
  | "notifications_sms"
  | "flight_delay_protection"
  | "priority_support";

export const FARE_BENEFIT_LABELS: { key: FareBenefitKey; label: string }[] = [
  { key: "guaranteed_spot", label: "Vaga garantida" },
  { key: "email_confirmation", label: "Confirmação por e-mail" },
  { key: "free_cancellation", label: "Cancelamento grátis" },
  { key: "plate_change", label: "Troca de placa/veículo" },
  { key: "date_change", label: "Alteração de data/horário" },
  { key: "notifications_sms", label: "Avisos por WhatsApp" },
  { key: "flight_delay_protection", label: "Proteção de voo: atraso ou cancelamento" },
  { key: "priority_support", label: "Suporte prioritário" },
];

/** Espelho de `cancelWindowLabel` (src/lib/fares.ts). */
export function cancelWindowLabel(cancelWindowMinutes: number | null | undefined): string | null {
  if (cancelWindowMinutes === null || cancelWindowMinutes === undefined) return null;
  if (cancelWindowMinutes <= 0) return "até a entrada";
  if (cancelWindowMinutes < 60) return `até ${cancelWindowMinutes} min antes`;
  if (cancelWindowMinutes % 1440 === 0) {
    const d = cancelWindowMinutes / 1440;
    return d === 1 ? "até 24h antes" : `até ${d} dias antes`;
  }
  if (cancelWindowMinutes % 60 === 0) return `até ${cancelWindowMinutes / 60}h antes`;
  return `até ${cancelWindowMinutes} min antes`;
}

/**
 * O que o benefício faz, para o agente responder sem deduzir pela chave. Só entra o que gera
 * dúvida; a regra é a da RPC `extend_booking_flight_delay` (tarifas-operacao.md §2.7).
 */
export const FARE_BENEFIT_DETAILS: Partial<Record<FareBenefitKey, string>> = {
  flight_delay_protection:
    "Se o voo de volta atrasar ou for cancelado, o cliente estende a saída pela própria reserva no site (Minhas reservas, botão \"Meu voo atrasou ou foi cancelado\"), informando o número do voo e a nova previsão. A Movepark paga até 24h a mais, uma vez por reserva. O que passar das 24h é cobrado pelo estacionamento no balcão, pela diária dele. Não serve para cancelar a reserva antes da viagem.",
};

export interface FareRow {
  tier: string;
  label: string;
  price_cents: number;
  is_popular: boolean;
  sort_order: number;
  cancel_window_minutes: number | null;
  benefits: Partial<Record<FareBenefitKey, boolean>> | null;
}

const TIER_ORDER = ["basica", "flex", "superflex"];

/**
 * Catálogo pronto para o agente: preço em reais, cancelamento em texto, benefícios incluídos e não
 * incluídos com o rótulo do site. Benefício que nenhuma tarifa tem fica fora das duas listas, como
 * no comparativo do site (hoje, `priority_support`).
 */
export function presentFares(rows: FareRow[]) {
  const cat = [...rows].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  const ofertados = FARE_BENEFIT_LABELS.filter(
    (b) => b.key !== "free_cancellation" && cat.some((f) => f.benefits?.[b.key] === true),
  );
  const fares = cat.map((f) => {
    const janela = cancelWindowLabel(f.cancel_window_minutes);
    return {
      tier: f.tier,
      label: f.label,
      price: f.price_cents / 100,
      price_cents: f.price_cents,
      is_popular: f.is_popular,
      cancellation: janela ? `Cancelamento grátis ${janela}` : "Sem cancelamento grátis",
      cancel_window_minutes: f.cancel_window_minutes,
      included: ofertados.filter((b) => f.benefits?.[b.key] === true).map((b) => b.label),
      not_included: ofertados.filter((b) => f.benefits?.[b.key] !== true).map((b) => b.label),
    };
  });
  const details = Object.fromEntries(
    ofertados
      .filter((b) => FARE_BENEFIT_DETAILS[b.key])
      .map((b) => [b.label, FARE_BENEFIT_DETAILS[b.key]!]),
  );
  return {
    fares,
    details,
    notes:
      "O preço da tarifa é fixo por reserva e soma ao valor da vaga (quote_booking e create_booking aceitam fare_tier). A tarifa é escolhida antes de reservar: o checkout não troca. Depois de confirmada, dá para subir de tarifa na página da reserva, pagando a diferença; não há troca para uma mais barata.",
  };
}
