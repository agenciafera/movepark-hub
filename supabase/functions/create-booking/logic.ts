/**
 * Lógica pura do wrapper de `create-booking`.
 *
 * A regra de reserva (capacidade, preço, cupom, expiração) vive na RPC
 * `create_booking_atomic`, que tem pgTAP próprio. O que estava sem teste é o wrapper:
 * o que ele valida antes de chamar, como monta os argumentos, e o `update` de UTM,
 * que é o ÚNICO ponto onde esta função escreve na `booking` fora da RPC atômica, com
 * service_role. É lá que um campo a mais no corpo viraria escrita não autorizada.
 */

export type FareTier = "basica" | "flex" | "superflex";

/**
 * O tipo mora aqui e o index importa: duas definicoes do mesmo corpo divergem, e a
 * que fica sem teste e sempre a que engana.
 *
 * O index-signature no fim nao e descuido: o corpo chega de um `req.json()`, entao ele
 * PODE trazer campo que ninguem declarou. Declarar isso e o que deixa os testes de
 * campo extra dizerem algo, em vez de o TypeScript fingir que o excesso nao existe.
 */
export type CreateBookingInput = {
  location_parking_type_id?: string;
  check_in_at?: string;
  check_out_at?: string;
  passenger_count?: number | null;
  has_pcd?: boolean;
  vehicle_id?: string | null;
  add_on_service_ids?: string[] | null;
  coupon_code?: string | null;
  origin?: string | null;
  fare_tier?: FareTier | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  /** Prova da origem (E0.3.12): quando clicou, por onde entrou e de onde veio. */
  attribution?: { clicked_at?: unknown; landing_url?: unknown; referrer?: unknown } | null;
  [extra: string]: unknown;
};

export type Validacao = { ok: true } | { ok: false; status: number; erro: string };

export function validarEntrada(input: CreateBookingInput): Validacao {
  if (!input.location_parking_type_id) {
    return { ok: false, status: 400, erro: "location_parking_type_id é obrigatório" };
  }
  if (!input.check_in_at || !input.check_out_at) {
    return { ok: false, status: 400, erro: "check_in_at e check_out_at são obrigatórios" };
  }
  return { ok: true };
}

/**
 * Monta os argumentos da RPC. Nada aqui é passado adiante do corpo cru: cada
 * parâmetro é nomeado, então um campo extra enviado pelo cliente não alcança a RPC.
 */
export function montarArgsRpc(profileId: string, input: CreateBookingInput) {
  return {
    p_profile_id: profileId,
    p_location_parking_type_id: input.location_parking_type_id,
    p_check_in_at: input.check_in_at,
    p_check_out_at: input.check_out_at,
    p_passenger_count: input.passenger_count ?? null,
    p_has_pcd: input.has_pcd ?? false,
    p_vehicle_id: input.vehicle_id ?? null,
    p_add_on_ids: input.add_on_service_ids ?? null,
    p_coupon_code: input.coupon_code ?? null,
    p_origin: input.origin ?? null,
    p_fare_tier: input.fare_tier ?? "basica",
  };
}

export type DecisaoUtm =
  | { gravar: false }
  | { gravar: true; patch: { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null } };

/**
 * Decide se o `update` de UTM roda, e com qual payload.
 *
 * O patch é montado a partir de TRÊS campos nomeados, nunca do corpo inteiro. É o
 * que impede alguém de mandar `status` ou `total_amount` no mesmo JSON e ver isso
 * chegar num update com service_role, que ignora RLS.
 */
export function decidirUtm(
  bookingId: string | undefined,
  input: CreateBookingInput,
): DecisaoUtm {
  if (!bookingId) return { gravar: false };
  if (!input.utm_source && !input.utm_medium && !input.utm_campaign) {
    return { gravar: false };
  }
  return {
    gravar: true,
    patch: {
      utm_source: input.utm_source ?? null,
      utm_medium: input.utm_medium ?? null,
      utm_campaign: input.utm_campaign ?? null,
    },
  };
}

export type Atribuicao = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  clicked_at: string | null;
  landing_url: string | null;
  referrer: string | null;
};

function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Monta a prova da origem que vai para `booking_apply_commission` (E0.3.12).
 *
 * Mesmo cuidado do patch de UTM: só campos NOMEADOS, cada um com tipo e tamanho conferidos,
 * porque isto vira jsonb gravado com service_role. Data ilegível vira null (o banco trata como
 * "sem data do clique"), página de entrada tem que ser caminho do próprio site e o referrer tem
 * que ser http(s). Sem UTM nenhum não há o que provar: devolve null e a reserva é do Hub, salvo
 * o white-label, que o banco reconhece pela `origin`.
 */
export function montarAtribuicao(input: CreateBookingInput): Atribuicao | null {
  const utm_source = texto(input.utm_source, 200);
  const utm_medium = texto(input.utm_medium, 200);
  const utm_campaign = texto(input.utm_campaign, 200);
  if (!utm_source && !utm_medium && !utm_campaign) return null;

  const a = input.attribution && typeof input.attribution === "object" ? input.attribution : {};
  const clickedRaw = texto(a.clicked_at, 40);
  const clicked = clickedRaw ? new Date(clickedRaw) : null;
  const landing = texto(a.landing_url, 500);
  const referrer = texto(a.referrer, 500);
  return {
    utm_source,
    utm_medium,
    utm_campaign,
    clicked_at: clicked && !Number.isNaN(clicked.getTime()) ? clicked.toISOString() : null,
    landing_url: landing && landing.startsWith("/") && !landing.startsWith("//") ? landing : null,
    referrer: referrer && /^https?:\/\//i.test(referrer) ? referrer : null,
  };
}
