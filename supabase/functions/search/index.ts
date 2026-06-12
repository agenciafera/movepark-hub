// Edge Function: /search
// Recebe params de busca e retorna lista enriquecida com preço, distância e amenidades.
// Calcula simulate_price em paralelo pra todos os matches.
//
// POST /functions/v1/search
// {
//   "dest": "GRU",                              // ou
//   "dest_lat": -23.4356, "dest_lng": -46.4731, //
//   "from": "2026-06-10T22:00:00Z",
//   "to":   "2026-06-15T08:00:00Z",
//   "vehicle": "car" | "motorcycle",
//   "category": ["covered","valet"],
//   "operator": ["aerovalet","plenty"],
//   "amenities": ["shuttle_free","cameras_24h"],
//   "max_distance_km": 5,
//   "sort": "price_asc" | "price_desc" | "distance_asc",
//   "limit": 20,
//   "offset": 0
// }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  availabilityFor,
  buildAvailabilityMap,
  soldOutTiebreak,
  type AvailabilityRow,
} from "./availability.ts";
import { haversineKm, nearestTerminal, type TerminalPoint } from "./proximity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SearchParams {
  dest?: string;
  dest_lat?: number;
  dest_lng?: number;
  from: string;
  to: string;
  vehicle?: "car" | "motorcycle";
  category?: string[];
  operator?: string[];
  amenities?: string[];
  max_distance_km?: number;
  min_rating?: number;
  sort?: "price_asc" | "price_desc" | "distance_asc" | "rating_desc";
  limit?: number;
  offset?: number;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } },
  );

  let params: SearchParams;
  try {
    params = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (!params.from || !params.to) {
    return jsonResponse({ error: "from/to are required" }, 400);
  }
  const checkIn = new Date(params.from);
  const checkOut = new Date(params.to);
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return jsonResponse({ error: "Invalid date format" }, 400);
  }
  if (checkOut <= checkIn) {
    return jsonResponse({ error: "to must be after from" }, 400);
  }

  // 1. Resolve destination coordinates if dest code provided.
  //    Quando há destino, carrega também os terminais (DAT-05) p/ a proximidade por terminal.
  let destLat = params.dest_lat;
  let destLng = params.dest_lng;
  let destInfo: { code: string; name: string } | null = null;
  let terminals: TerminalPoint[] = [];
  if (params.dest) {
    const { data: dest } = await supabase
      .from("destination")
      .select("id, code, name, latitude, longitude")
      .eq("code", params.dest)
      .maybeSingle();
    if (dest) {
      if (destLat == null) {
        destLat = Number(dest.latitude);
        destLng = Number(dest.longitude);
      }
      destInfo = { code: dest.code, name: dest.name };
      const { data: pts } = await supabase
        .from("destination_point")
        .select("name, latitude, longitude")
        .eq("destination_id", dest.id)
        .order("sort_order");
      terminals = (pts ?? []).map((p) => ({
        name: p.name as string,
        latitude: p.latitude != null ? Number(p.latitude) : null,
        longitude: p.longitude != null ? Number(p.longitude) : null,
      }));
    }
  }

  // 2. Calculate days (any_extra policy padrão)
  const totalMinutes = (checkOut.getTime() - checkIn.getTime()) / (60 * 1000);
  const days = Math.max(1, Math.ceil(totalMinutes / (60 * 24)));

  // 3. Query candidates
  const { data: rows, error } = await supabase
    .from("location_parking_type")
    .select(
      `
      id, capacity, is_active,
      location:location!inner(
        id, slug, name, address, latitude, longitude, status, deleted_at,
        review_avg, review_count,
        company:company!inner(id, slug, name, status),
        amenities:location_amenity(amenity_code)
      ),
      company_parking_type:company_parking_type!inner(
        id, base_price,
        parking_type:parking_type!inner(id, code, name)
      )
    `,
    )
    .eq("is_active", true);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  // 4. Filter — only active locations + active companies
  // deno-lint-ignore no-explicit-any
  let filtered: any[] = (rows ?? []).filter((r: any) => {
    if (!r.location || r.location.deleted_at) return false;
    if (r.location.status !== "active") return false;
    if (!r.location.company || r.location.company.status !== "active") return false;
    return true;
  });

  // 5. Apply category filter
  if (params.category?.length) {
    filtered = filtered.filter((r) =>
      params.category!.includes(r.company_parking_type.parking_type.code),
    );
  }

  // 6. Apply operator filter
  if (params.operator?.length) {
    filtered = filtered.filter((r) =>
      params.operator!.includes(r.location.company.slug),
    );
  }

  // 7. Apply amenities filter (must include all)
  if (params.amenities?.length) {
    filtered = filtered.filter((r) => {
      const codes = new Set(
        // deno-lint-ignore no-explicit-any
        (r.location.amenities ?? []).map((a: any) => a.amenity_code),
      );
      return params.amenities!.every((c) => codes.has(c));
    });
  }

  // 8. Compute distance + filter by max_distance_km
  const withDistance = filtered.map((r) => {
    let distance: number | null = null;
    if (
      destLat != null &&
      destLng != null &&
      r.location.latitude != null &&
      r.location.longitude != null
    ) {
      distance = haversineKm(
        destLat,
        destLng,
        Number(r.location.latitude),
        Number(r.location.longitude),
      );
    }
    return { ...r, _distance: distance };
  });

  let distanceFiltered = withDistance;
  if (params.max_distance_km != null && destLat != null) {
    distanceFiltered = distanceFiltered.filter(
      (r) => r._distance != null && r._distance <= params.max_distance_km!,
    );
  }
  if (params.min_rating != null) {
    distanceFiltered = distanceFiltered.filter(
      (r) => r.location.review_avg != null && Number(r.location.review_avg) >= params.min_rating!,
    );
  }

  // 8b. Disponibilidade em lote (1 query, sem N+1) para o período pedido
  const lptIds = distanceFiltered.map((r) => r.id as string);
  let availMap = buildAvailabilityMap(null);
  if (lptIds.length > 0) {
    const { data: availRows } = await supabase.rpc("availability_batch", {
      p_lpt_ids: lptIds,
      p_check_in_at: params.from,
      p_check_out_at: params.to,
    });
    availMap = buildAvailabilityMap((availRows ?? null) as AvailabilityRow[] | null);
  }

  // 9. Run simulate_price in parallel
  const priced = await Promise.all(
    distanceFiltered.map(async (r) => {
      const { data: sim, error: simErr } = await supabase.rpc("simulate_price", {
        p_company: r.location.company.slug,
        p_location: r.location.slug,
        p_parking_type: r.company_parking_type.parking_type.code,
        p_days: days,
      });
      if (simErr) {
        return { ...r, _price: null, _old_price: null, _price_error: simErr.message };
      }
      // deno-lint-ignore no-explicit-any
      const s = sim as any;
      return {
        ...r,
        _price: s?.price != null ? Number(s.price) : null,
        _old_price: s?.old_price != null ? Number(s.old_price) : null,
        _price_error: s?.error ?? null,
      };
    }),
  );

  // 10. Drop unpriceable results
  const withPrice = priced.filter((r) => r._price != null);

  // 11. Sort — esgotados sempre por último, depois o critério escolhido
  const sort = params.sort ?? "price_asc";
  withPrice.sort((a, b) => {
    const soldOut = soldOutTiebreak(availabilityFor(availMap, a.id), availabilityFor(availMap, b.id));
    if (soldOut !== 0) return soldOut;
    if (sort === "price_asc") return (a._price ?? Infinity) - (b._price ?? Infinity);
    if (sort === "price_desc") return (b._price ?? -Infinity) - (a._price ?? -Infinity);
    if (sort === "rating_desc") {
      return (Number(b.location.review_avg) || 0) - (Number(a.location.review_avg) || 0);
    }
    if (sort === "distance_asc") {
      const ad = a._distance ?? Infinity;
      const bd = b._distance ?? Infinity;
      return ad - bd;
    }
    return 0;
  });

  // 12. Paginate
  const limit = Math.min(params.limit ?? 20, 50);
  const offset = params.offset ?? 0;
  const total = withPrice.length;
  const page = withPrice.slice(offset, offset + limit);

  // 13. Map to response shape
  const results = page.map((r) => ({
    id: r.id,
    operator: {
      slug: r.location.company.slug,
      name: r.location.company.name,
    },
    location: {
      id: r.location.id,
      slug: r.location.slug,
      name: r.location.name,
      address: r.location.address,
      latitude: r.location.latitude != null ? Number(r.location.latitude) : null,
      longitude: r.location.longitude != null ? Number(r.location.longitude) : null,
      distance_km: r._distance != null ? Number(r._distance.toFixed(2)) : null,
      // Terminal mais próximo do destino buscado (PRD-09 · DAT-05). null se o destino não
      // tem terminais ou o lote não tem geo — aí vale a proximidade ao centro (distance_km).
      nearest_terminal: nearestTerminal(
        r.location.latitude != null ? Number(r.location.latitude) : null,
        r.location.longitude != null ? Number(r.location.longitude) : null,
        terminals,
      ),
      review_avg: r.location.review_avg != null ? Number(r.location.review_avg) : null,
      review_count: r.location.review_count ?? 0,
    },
    parking_type: {
      code: r.company_parking_type.parking_type.code,
      name: r.company_parking_type.parking_type.name,
    },
    capacity: r.capacity,
    availability: availabilityFor(availMap, r.id),
    price: {
      total: r._price,
      old_price: r._old_price,
      per_day: r._price != null ? Number((r._price / days).toFixed(2)) : null,
      days,
    },
    // deno-lint-ignore no-explicit-any
    amenities: (r.location.amenities ?? []).map((a: any) => a.amenity_code),
  }));

  return jsonResponse({
    destination: destInfo
      ? { ...destInfo, latitude: destLat, longitude: destLng }
      : destLat != null
        ? { latitude: destLat, longitude: destLng }
        : null,
    days,
    total,
    limit,
    offset,
    results,
  });
});
