import * as React from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CouponPreview } from "./coupon.logic";
import { buildPriceShowcase, type AddOnOption, type PriceShowcase } from "./reservation.logic";
import type { AvailabilityCheck, MinStayUnit } from "./availability.logic";
import type { GooglePlaceSnapshot } from "@/types/domain";
import { fetchGooglePlaceSnapshot } from "@/features/reviews/googleApi";

export type ListingDetail = {
  id: string; // location_parking_type_id
  capacity: number;
  is_active: boolean;
  /**
   * URL de saída para o checkout do parceiro, montada NO SERVIDOR com a marcação de afiliado
   * (campo computado do PostgREST). Null quando a unidade fecha no Hub ou o De/Para está
   * incompleto. O front nunca monta essa URL; só acrescenta as datas da busca no fim.
   */
  external_checkout_url: string | null;
  company: {
    id: string;
    slug: string;
    name: string;
    legal_name: string | null;
    created_at: string;
  };
  location: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    notice: string | null;
    has_notice: boolean;
    directions_text: string | null;
    shuttle_frequency_minutes: number | null;
    shuttle_to_terminal_minutes: number | null;
    reservation_policy: string | null;
    /** Onde a reserva desta unidade fecha (E0.14). Fonte primária das capacidades (ADR-009). */
    checkout_mode: string;
    /**
     * A unidade opera o transfer com a Go2Park (rastreio da van em tempo real). Fato da unidade,
     * não promessa de transação: renderiza também em checkout externo, que é onde estão as três
     * unidades com o contrato hoje.
     */
    go2park_enabled: boolean;
    /** WhatsApp da van desta unidade (E.164), copiado do painel da Go2Park. Nulo enquanto ninguém
     *  preencheu, e aí a página mostra o bloco sem o CTA de contato. */
    go2park_whatsapp: string | null;
    timezone: string;
    latitude: number | null;
    longitude: number | null;
    /** Place ID do Google, capturado no cadastro do endereço. Dá o pin exato no mapa. */
    google_place_id: string | null;
    has_pcd_config: boolean;
    has_passenger_quantity: boolean;
    review_avg: number | null;
    review_count: number;
    photos: string[];
    /**
     * Destino âncora da unidade, só com o que o SEO precisa. O título e o H1 da página
     * nomeiam o aeroporto porque consulta de marca de parceiro quase sempre vem com a
     * cidade junto ("aeropark guarulhos", "garageinn viracopos"), e o título antigo não
     * trazia nem a marca nem o aeroporto. Nulo em unidade sem destino vinculado.
     */
    destination: { seo_label: string | null; short_name: string | null; name: string; type: string | null; city: string | null } | null;
  };
  parking_type: {
    code: string;
    name: string;
    description: string | null;
  };
  company_parking_type: {
    base_price: number;
  };
  amenities: { code: string; name: string; icon: string | null; category: string }[];
  other_locations: { id: string; name: string; slug: string }[];
  /**
   * Espelho do Google carregado no build. O bloco precisa sair no HTML: crawler de IA não
   * executa JS. `null` quando a unidade não tem place_id ou o snapshot venceu.
   */
  google: GooglePlaceSnapshot | null;
};

const baseSelect = `
  id, capacity, is_active, external_checkout_url,
  location:location!inner(
    id, slug, name, address, phone, email, notice, has_notice,
    directions_text, shuttle_frequency_minutes, shuttle_to_terminal_minutes,
    reservation_policy, checkout_mode, go2park_enabled, go2park_whatsapp, timezone, latitude, longitude, google_place_id,
    has_pcd_config, has_passenger_quantity, review_avg, review_count, photos,
    company:company!inner(id, slug, name, legal_name, created_at),
    destination:destination(seo_label, short_name, name, type, city),
    amenities:location_amenity(
      amenity:amenity(code, name, icon, category, sort_order)
    )
  ),
  company_parking_type:company_parking_type!inner(
    base_price,
    parking_type:parking_type!inner(code, name, description)
  )
`;

export async function fetchListing(
  operatorSlug: string,
  locationSlug: string,
  parkingTypeCode: string,
): Promise<ListingDetail | null> {
  const { data, error } = await supabase
    .from("location_parking_type")
    .select(baseSelect)
    .eq("is_active", true)
    // Só serve a página pública /p/... de unidades listadas (gate de recebedor ativo). A RLS
    // pública já exige location.is_listed; este filtro deixa explícito. O preview do dono usa
    // outra leitura (previewApi, RLS de dono), que ignora is_listed.
    .eq("location.is_listed", true)
    .limit(50);
  if (error) throw error;

  // deno-lint-ignore no-explicit-any
  const match = (data ?? []).find((r: any) => {
    return (
      r.location?.slug === locationSlug &&
      r.location?.company?.slug === operatorSlug &&
      r.company_parking_type?.parking_type?.code === parkingTypeCode
    );
  });
  if (!match) return null;

  // Cast via `unknown`: `external_checkout_url` é campo COMPUTADO do PostgREST (função que
  // recebe a linha de location_parking_type). O `supabase gen types` não emite computed field,
  // então o tipo gerado marca a coluna como inexistente e envenena o retorno inteiro do select,
  // mesmo o servidor devolvendo o valor. Compor a URL no cliente para contornar isso está fora
  // de questão (é onde a marcação de afiliado se perde), e uma RPC extra custaria round trip no
  // caminho da página pública.
  const matched = match as unknown as {
    location: { id: string; company: { id: string } };
  };
  const companyId = matched.location.company.id;
  const { data: others } = await supabase
    .from("location")
    .select("id, name, slug")
    .eq("company_id", companyId)
    .neq("id", matched.location.id)
    .is("deleted_at", null)
    .limit(6);

  // deno-lint-ignore no-explicit-any
  const m = match as any;
  const amenitiesRaw = (m.location.amenities ?? [])
    // deno-lint-ignore no-explicit-any
    .map((a: any) => a.amenity)
    .filter(Boolean)
    // deno-lint-ignore no-explicit-any
    .sort((a: any, b: any) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

  // Espelho do Google (§6 de avaliacoes-google.md): busca no loader do SSG, nunca em hook, pro
  // bloco sair no HTML pré-renderizado. A policy de leitura já esconde snapshot velho/oculto; o
  // componente confere de novo no cliente, porque o HTML publicado também é cache (§5 da spec).
  // A consulta mora em `reviews/googleApi.ts`: a ficha do lote mapeado carrega o mesmo
  // snapshot, e duas cópias da mesma query divergem na primeira mudança de campo.
  const google: GooglePlaceSnapshot | null = m.location.google_place_id
    ? await fetchGooglePlaceSnapshot(m.location.google_place_id)
    : null;

  return {
    id: m.id,
    capacity: m.capacity,
    is_active: m.is_active,
    external_checkout_url: m.external_checkout_url ?? null,
    company: m.location.company,
    location: {
      id: m.location.id,
      slug: m.location.slug,
      name: m.location.name,
      // Default 'hub' na leitura: a coluna nasceu com esse default e ler ausência como
      // 'external' apagaria a página de toda unidade nativa se o select falhasse.
      checkout_mode: m.location.checkout_mode ?? "hub",
      // Ausência lida como false: o selo do transfer ao vivo é contrato, e prometer rastreio
      // que a unidade não tem é pior que deixar de mostrar o que ela tem.
      go2park_enabled: m.location.go2park_enabled === true,
      go2park_whatsapp: m.location.go2park_whatsapp ?? null,
      // Embed pode voltar null (unidade sem destino âncora) ou objeto. O SEO trata os dois.
      destination: m.location.destination ?? null,
      address: m.location.address,
      phone: m.location.phone,
      email: m.location.email,
      notice: m.location.notice,
      has_notice: m.location.has_notice,
      directions_text: m.location.directions_text ?? null,
      shuttle_frequency_minutes:
        m.location.shuttle_frequency_minutes != null
          ? Number(m.location.shuttle_frequency_minutes)
          : null,
      shuttle_to_terminal_minutes:
        m.location.shuttle_to_terminal_minutes != null
          ? Number(m.location.shuttle_to_terminal_minutes)
          : null,
      reservation_policy: m.location.reservation_policy,
      timezone: m.location.timezone,
      latitude: m.location.latitude != null ? Number(m.location.latitude) : null,
      longitude: m.location.longitude != null ? Number(m.location.longitude) : null,
      google_place_id: m.location.google_place_id ?? null,
      has_pcd_config: m.location.has_pcd_config,
      has_passenger_quantity: m.location.has_passenger_quantity,
      review_avg: m.location.review_avg != null ? Number(m.location.review_avg) : null,
      review_count: m.location.review_count ?? 0,
      photos: Array.isArray(m.location.photos) ? (m.location.photos as string[]) : [],
    },
    parking_type: m.company_parking_type.parking_type,
    company_parking_type: {
      base_price: Number(m.company_parking_type.base_price),
    },
    amenities: amenitiesRaw,
    other_locations: (others ?? []) as { id: string; name: string; slug: string }[],
    google,
  };
}

/**
 * Serviços adicionais ativos disponíveis numa unidade (catálogo público).
 * Preço efetivo = price_override da unidade, senão base_price do serviço.
 */
export function useLocationAddOns(locationId: string | undefined) {
  return useQuery({
    queryKey: ["location-add-ons", locationId ?? "none"] as const,
    enabled: !!locationId,
    staleTime: 60_000,
    queryFn: async (): Promise<AddOnOption[]> => {
      const { data, error } = await supabase
        .from("location_add_on_service")
        .select(
          "price_override, add_on_service:add_on_service!inner(id, name, description, base_price, is_active, sort_order)",
        )
        .eq("location_id", locationId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? [])
        // deno-lint-ignore no-explicit-any
        .filter((r: any) => r.add_on_service?.is_active)
        // deno-lint-ignore no-explicit-any
        .sort((a: any, b: any) => (a.add_on_service.sort_order ?? 0) - (b.add_on_service.sort_order ?? 0))
        // deno-lint-ignore no-explicit-any
        .map((r: any) => ({
          id: r.add_on_service.id,
          name: r.add_on_service.name,
          description: r.add_on_service.description,
          price:
            r.price_override != null
              ? Number(r.price_override)
              : Number(r.add_on_service.base_price),
        }));
    },
  });
}

/** Distância do lote a cada terminal do seu destino (view location_point_proximity, DAT-05). */
export type TerminalDistance = {
  point_name: string;
  point_type: string;
  distance_km: number | null;
  is_nearest: boolean;
};

/**
 * Distância por terminal de uma unidade (PRD-09). Lê a view `location_point_proximity`
 * (haversine em SQL, DAT-05), vazia quando o destino do lote não tem terminais.
 */
export function useLocationTerminals(locationId: string | undefined) {
  return useQuery({
    queryKey: ["location-terminals", locationId ?? "none"] as const,
    enabled: !!locationId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TerminalDistance[]> => {
      const { data, error } = await supabase
        .from("location_point_proximity")
        .select("point_name, point_type, distance_km, is_nearest, sort_order")
        .eq("location_id", locationId!)
        .order("sort_order");
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((r: any) => ({
        point_name: r.point_name as string,
        point_type: r.point_type as string,
        distance_km: r.distance_km != null ? Number(r.distance_km) : null,
        is_nearest: !!r.is_nearest,
      }));
    },
  });
}

export function useListing(
  operatorSlug: string | undefined,
  locationSlug: string | undefined,
  parkingTypeCode: string | undefined,
  options?: { initialData?: ListingDetail },
) {
  return useQuery({
    queryKey: ["listing", operatorSlug, locationSlug, parkingTypeCode] as const,
    queryFn: () => fetchListing(operatorSlug!, locationSlug!, parkingTypeCode!),
    enabled: !!operatorSlug && !!locationSlug && !!parkingTypeCode,
    staleTime: 60_000,
    initialData: options?.initialData,
  });
}

export type SimulatedPrice = {
  price: number | null;
  old_price: number | null;
  /** Desconto automático aplicado (regra), com rótulo "-20%". Null se não houver. */
  discount: { amount: number; label: string } | null;
  days: number;
  error?: string | null;
};

/**
 * Opções de query do simulate_price para uma duração. Fonte única usada por
 * `useSimulatePrice` (uma duração) e `useDurationPrices` (tabela): mesma key,
 * então o cache é compartilhado entre o reservation card e a tabela de preços.
 */
function simulatePriceQueryOptions(
  companySlug: string | undefined,
  locationSlug: string | undefined,
  parkingTypeCode: string | undefined,
  days: number,
) {
  return {
    // Com underscore, igual ao nome da RPC. Com hífen, o nome batia com o de uma Edge Function
    // homônima que reimplementava o motor e foi despublicada em 14/08/2026: quem grepasse por
    // "simulate-price" caía nesta chave de cache e achava que o site chamava aquele endpoint.
    queryKey: ["simulate_price", companySlug, locationSlug, parkingTypeCode, days] as const,
    queryFn: async (): Promise<SimulatedPrice> => {
      const { data, error } = await supabase.rpc("simulate_price", {
        p_company: companySlug!,
        p_location: locationSlug!,
        p_parking_type: parkingTypeCode!,
        p_days: days,
      });
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      const r = data as any;
      return {
        price: r?.price != null ? Number(r.price) : null,
        old_price: r?.old_price != null ? Number(r.old_price) : null,
        discount: r?.discount
          ? { amount: Number(r.discount.amount), label: String(r.discount.label) }
          : null,
        days,
        error: r?.error ?? null,
      };
    },
    enabled: !!companySlug && !!locationSlug && !!parkingTypeCode && days > 0,
    staleTime: 30_000,
  };
}

/** Tipos de vaga ativos de uma unidade (código + nome), para o upsell de upgrade (E2.1.4). */
export async function fetchLocationTypes(
  companySlug: string,
  locationSlug: string,
): Promise<{ code: string; name: string }[]> {
  const { data, error } = await supabase
    .from("location_parking_type")
    .select(
      `location:location!inner(slug, is_listed, company:company!inner(slug)),
       company_parking_type:company_parking_type!inner(parking_type:parking_type!inner(code, name))`,
    )
    .eq("is_active", true)
    .eq("location.slug", locationSlug)
    .eq("location.is_listed", true)
    .eq("location.company.slug", companySlug)
    .limit(50);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    code: r.company_parking_type.parking_type.code as string,
    name: r.company_parking_type.parking_type.name as string,
  }));
}

/**
 * Durações de referência da vitrine de preço. As mesmas de `destination_price_index` e da
 * página /precos, para que a faixa da unidade e a tabela do destino não briguem.
 */
export const SHOWCASE_DAYS = [1, 7, 15, 30] as const;

/**
 * Faixa de diária da unidade, direto do motor de preço.
 *
 * Roda no LOADER, e não só no cliente, porque a página é pré-renderizada: preço que só existe
 * depois do JS não entra no HTML do build, e nem o `AggregateOffer` do JSON-LD nem o "a partir
 * de" do card apareceriam para quem lê o HTML cru (crawler de IA não executa JS).
 *
 * Uma duração que falha vira `null` e some da faixa, em vez de derrubar as outras três: numa
 * unidade com estadia mínima de 2 diárias, a consulta de 1 dia não tem preço por definição.
 */
export async function fetchPriceShowcase(
  companySlug: string,
  locationSlug: string,
  parkingTypeCode: string,
): Promise<PriceShowcase | null> {
  const totais = await Promise.all(
    SHOWCASE_DAYS.map(async (days) => {
      try {
        const { data, error } = await supabase.rpc("simulate_price", {
          p_company: companySlug,
          p_location: locationSlug,
          p_parking_type: parkingTypeCode,
          p_days: days,
        });
        if (error) throw error;
        // deno-lint-ignore no-explicit-any
        const r = data as any;
        return { days, total: r?.price != null ? Number(r.price) : null };
      } catch {
        return { days, total: null };
      }
    }),
  );
  return buildPriceShowcase(totais);
}

/** Chave de cache da vitrine de preço, compartilhada entre o loader e o cliente. */
export const priceShowcaseKey = (
  companySlug: string | undefined,
  locationSlug: string | undefined,
  parkingTypeCode: string | undefined,
) => ["price-showcase", companySlug, locationSlug, parkingTypeCode] as const;

/**
 * A vitrine de preço na página. O loader já traz no build; o hook cobre a navegação por link
 * (soft nav), onde o HTML pré-renderizado não é buscado de novo.
 */
export function usePriceShowcase(
  companySlug: string | undefined,
  locationSlug: string | undefined,
  parkingTypeCode: string | undefined,
  initialData?: PriceShowcase | null,
) {
  return useQuery({
    queryKey: priceShowcaseKey(companySlug, locationSlug, parkingTypeCode),
    queryFn: () => fetchPriceShowcase(companySlug!, locationSlug!, parkingTypeCode!),
    enabled: !!companySlug && !!locationSlug && !!parkingTypeCode,
    initialData,
    staleTime: 60_000,
  });
}

/**
 * Tipos de vaga da unidade com o preço simulado de cada, para a duração atual. Usado pelo upsell de
 * upgrade da página da unidade (E2.1.4): o catálogo carrega uma vez e cada preço é uma query própria
 * que compartilha o cache do reservation card (mesma key do simulate_price).
 */
export function useLocationTypePrices(args: {
  companySlug: string | undefined;
  locationSlug: string | undefined;
  days: number;
}): { types: import("./upgrade.logic").TypePrice[]; isLoading: boolean } {
  const catalog = useQuery({
    queryKey: ["location-types", args.companySlug, args.locationSlug] as const,
    queryFn: () => fetchLocationTypes(args.companySlug!, args.locationSlug!),
    enabled: !!args.companySlug && !!args.locationSlug,
    staleTime: 60_000,
  });
  const codes = catalog.data ?? [];
  const priceQueries = useQueries({
    queries: codes.map((t) =>
      simulatePriceQueryOptions(args.companySlug, args.locationSlug, t.code, args.days),
    ),
  });
  const types = codes.map((t, i) => ({
    code: t.code,
    name: t.name,
    price: priceQueries[i]?.data?.price ?? null,
  }));
  const isLoading = catalog.isLoading || priceQueries.some((q) => q.isLoading);
  return { types, isLoading };
}

/**
 * Simula preço chamando simulate_price RPC.
 * Recalcula automaticamente quando `args` mudam (com debounce no consumer).
 */
export function useSimulatePrice(args: {
  companySlug: string | undefined;
  locationSlug: string | undefined;
  parkingTypeCode: string | undefined;
  days: number;
}) {
  return useQuery(
    simulatePriceQueryOptions(args.companySlug, args.locationSlug, args.parkingTypeCode, args.days),
  );
}

/**
 * Preços para várias durações (tabela "ver preços"). Cada duração é uma query
 * independente, compartilha cache com `useSimulatePrice` (mesma key) e carrega
 * incrementalmente. Retorna os resultados na ordem de `durations`.
 */
export function useDurationPrices(args: {
  companySlug: string | undefined;
  locationSlug: string | undefined;
  parkingTypeCode: string | undefined;
  durations: number[];
  enabled?: boolean;
}) {
  return useQueries({
    queries: args.durations.map((days) => {
      const opts = simulatePriceQueryOptions(
        args.companySlug,
        args.locationSlug,
        args.parkingTypeCode,
        days,
      );
      return { ...opts, enabled: opts.enabled && (args.enabled ?? true) };
    }),
  });
}

/**
 * Disponibilidade + regras de reserva para o período escolhido (RPC check_availability).
 * Recalcula quando as datas mudam (com debounce no consumer).
 */
export function useAvailability(args: {
  companySlug: string | undefined;
  locationSlug: string | undefined;
  parkingTypeCode: string | undefined;
  from: Date | null;
  to: Date | null;
}) {
  const fromIso = args.from ? args.from.toISOString() : null;
  const toIso = args.to ? args.to.toISOString() : null;
  return useQuery({
    queryKey: ["check-availability", args.companySlug, args.locationSlug, args.parkingTypeCode, fromIso, toIso] as const,
    enabled:
      !!args.companySlug &&
      !!args.locationSlug &&
      !!args.parkingTypeCode &&
      !!fromIso &&
      !!toIso &&
      !!args.from &&
      !!args.to &&
      args.to > args.from,
    staleTime: 30_000,
    queryFn: async (): Promise<AvailabilityCheck> => {
      const { data, error } = await supabase.rpc("check_availability", {
        p_company: args.companySlug!,
        p_location: args.locationSlug!,
        p_parking_type: args.parkingTypeCode!,
        p_check_in_at: fromIso!,
        p_check_out_at: toIso!,
      });
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      const r = data as any;
      return {
        ok: !!r?.ok,
        capacity: Number(r?.capacity ?? 0),
        remaining: Number(r?.remaining ?? 0),
        sold_out: !!r?.sold_out,
        near_capacity: !!r?.near_capacity,
        near_capacity_message: r?.near_capacity_message ?? null,
        min_stay_ok: r?.min_stay_ok ?? true,
        min_stay_value: r?.min_stay_value != null ? Number(r.min_stay_value) : null,
        min_stay_unit: (r?.min_stay_unit ?? null) as MinStayUnit | null,
        min_date_ok: r?.min_date_ok ?? true,
        minimum_date: r?.minimum_date ?? null,
        advance_ok: r?.advance_ok ?? true,
        advance_minutes: r?.advance_minutes != null ? Number(r.advance_minutes) : null,
        past_ok: r?.past_ok ?? true,
        days: Number(r?.days ?? 0),
        reasons: Array.isArray(r?.reasons) ? r.reasons : [],
        error: r?.error ?? null,
      };
    },
  });
}

/**
 * Pré-valida um cupom sem criar reserva. Deslogado usa `validate_coupon_public` (anônimo, sem
 * preview de per_user_limit); logado usa `validate_coupon` (com o auth.uid()). O enforcement real
 * do limite acontece no create_booking_atomic. Retorna preview do desconto ou error_code.
 */
export function useValidateCoupon() {
  return useMutation({
    mutationFn: async (args: {
      code: string;
      location_parking_type_id: string;
      check_in_at: string;
      check_out_at: string;
    }): Promise<CouponPreview> => {
      const { data: sess } = await supabase.auth.getSession();
      const rpc = sess.session ? "validate_coupon" : "validate_coupon_public";
      const { data, error } = await supabase.rpc(rpc, {
        p_code: args.code,
        p_location_parking_type_id: args.location_parking_type_id,
        p_check_in_at: args.check_in_at,
        p_check_out_at: args.check_out_at,
      });
      if (error) throw new Error(error.message);
      // deno-lint-ignore no-explicit-any
      const r = data as any;
      return {
        valid: !!r?.valid,
        discount: Number(r?.discount ?? 0),
        subtotal: Number(r?.subtotal ?? 0),
        total_preview: Number(r?.total_preview ?? 0),
        code: r?.code ?? args.code.toUpperCase(),
        error_code: r?.error_code ?? null,
        discount_type: r?.discount_type,
        discount_value: r?.discount_value != null ? Number(r.discount_value) : undefined,
      };
    },
  });
}

/** Hook utilitário: debounce de um valor por X ms. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Cria booking via Edge Function /functions/v1/create-booking.
 */
export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      location_parking_type_id: string;
      check_in_at: string;
      check_out_at: string;
      vehicle_id?: string | null;
      passenger_count?: number | null;
      has_pcd?: boolean;
      add_on_service_ids?: string[];
      coupon_code?: string | null;
      fare_tier?: "basica" | "flex" | "superflex" | null;
      origin?: string | null;
      utm_source?: string | null;
      utm_medium?: string | null;
      utm_campaign?: string | null;
    }): Promise<{
      code: string;
      booking_id: string;
      total_amount: number;
      days: number;
      expires_at: string;
    }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Você precisa entrar pra reservar.");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-booking`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Falha (HTTP ${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });
}
