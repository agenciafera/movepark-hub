// Edge Function: /get-faq
// Retorna FAQ pública em camadas (ADR-002 · global → destination → location),
// mesclada e deduplicada — nunca duplicada. Fontes combinadas:
//   1) Q&As autogeradas a partir dos dados do estacionamento (endereço, tipos de vaga,
//      capacidade, amenidades, contato)                          — scope='auto'
//   2) FAQs cadastradas específicas daquela location             — scope='location'
//   3) FAQs do aeroporto/destino (da location ou via destination_id) — scope='destination'
//   4) FAQs globais da Movepark                                  — scope='global'
//
// Resolução por entrada:
//   - location_id  → auto + location + destination(da location) + global
//   - destination_id (sem location) → destination + global   (página do destino)
//   - nada         → só global
//
// Dedupe: mesma pergunta em mais de um escopo mantém a mais específica
// (location > destination > global). Um único FAQPage por página é montado no front.
//
// POST /functions/v1/get-faq
// { "location_id"?, "destination_id"?, "category_slug"?, "query"?, "limit"? }
//
// Usada pelo consumer (listing detail + página de destino) e pela tool `get_faq` do MCP n8n.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { describeBusinessHours } from "./hours.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  location_id?: string;
  destination_id?: string;
  category_slug?: string;
  query?: string;
  limit?: number;
};

type Category = { slug: string; label: string; sort_order: number };

type FaqItem = {
  id: string;
  scope: "global" | "location" | "destination" | "auto";
  location_id: string | null;
  destination_id: string | null;
  question: string;
  answer: string;
  sort_order: number;
  category: Category | null;
};

const AUTO_CATEGORY: Category = {
  slug: "este-estacionamento",
  label: "Este estacionamento",
  sort_order: -1,
};

function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json", ...extra },
  });
}

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function pluralUnit(value: number, unit: string): string {
  const map: Record<string, [string, string]> = {
    minutes: ["minuto", "minutos"],
    hours: ["hora", "horas"],
    days: ["dia", "dias"],
    months: ["mês", "meses"],
  };
  const [s, p] = map[unit] ?? [unit, unit];
  return value === 1 ? s : p;
}

type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  notice: string | null;
  has_notice: boolean | null;
  reservation_policy: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  is_24h: boolean | null;
  business_hours: unknown;
};

type LptRow = {
  capacity: number | null;
  is_active: boolean;
  has_minimum_stay: boolean | null;
  minimum_stay_value: number | null;
  minimum_stay_unit: string | null;
  company_parking_type: {
    base_price: number | null;
    parking_type: { code: string; name: string } | null;
  } | null;
};

type AmenityRow = {
  amenity: { code: string; name: string; category: string } | null;
  notes: string | null;
};

// @ts-expect-error - any
async function buildAutoFaq(supa, locationId: string): Promise<FaqItem[]> {
  const [{ data: loc }, { data: lpts }, { data: amenities }] = await Promise.all([
    supa
      .from("location")
      .select(
        "id, name, address, phone, email, timezone, notice, has_notice, reservation_policy, latitude, longitude, google_maps_url, is_24h, business_hours",
      )
      .eq("id", locationId)
      .maybeSingle(),
    supa
      .from("location_parking_type")
      .select(
        "capacity, is_active, has_minimum_stay, minimum_stay_value, minimum_stay_unit, company_parking_type:company_parking_type_id(base_price, parking_type:parking_type_id(code, name))",
      )
      .eq("location_id", locationId)
      .eq("is_active", true),
    supa
      .from("location_amenity")
      .select("notes, amenity:amenity_code(code, name, category)")
      .eq("location_id", locationId),
  ]);

  if (!loc) return [];

  const L = loc as LocationRow;
  const lptRows = (lpts ?? []) as LptRow[];
  const amRows = (amenities ?? []) as AmenityRow[];
  const items: FaqItem[] = [];

  // 1) Endereço / localização
  if (L.address) {
    const lines = [L.address];
    if (L.timezone) lines.push(`Fuso horário: ${L.timezone}.`);
    if (L.latitude != null && L.longitude != null) {
      lines.push(
        `Coordenadas: ${L.latitude.toFixed(5)}, ${L.longitude.toFixed(5)}.`,
      );
    }
    if (L.google_maps_url) {
      lines.push(`Google Maps: ${L.google_maps_url}`);
    }
    items.push({
      id: `auto:${L.id}:address`,
      scope: "auto",
      location_id: L.id,
      destination_id: null,
      question: `Onde fica o estacionamento ${L.name}?`,
      answer: lines.join("\n"),
      sort_order: 1,
      category: AUTO_CATEGORY,
    });
  }

  // 1b) Horário de funcionamento e retirada fora do horário
  {
    const { hours, afterHours } = describeBusinessHours(L.is_24h ?? true, L.business_hours);
    items.push({
      id: `auto:${L.id}:hours`,
      scope: "auto",
      location_id: L.id,
      destination_id: null,
      question: "Qual o horário de funcionamento?",
      answer: hours,
      sort_order: 1.5,
      category: AUTO_CATEGORY,
    });
    items.push({
      id: `auto:${L.id}:after-hours`,
      scope: "auto",
      location_id: L.id,
      destination_id: null,
      question: "Posso retirar o carro fora do horário?",
      answer: afterHours,
      sort_order: 1.6,
      category: AUTO_CATEGORY,
    });
  }

  // 2) Tipos de vaga + preço base + capacidade por tipo
  const validLpts = lptRows.filter(
    (r) => r.company_parking_type?.parking_type && r.capacity != null,
  );
  if (validLpts.length > 0) {
    const lines = validLpts.map((r) => {
      const pt = r.company_parking_type!.parking_type!;
      const base = r.company_parking_type!.base_price;
      const baseNum = base != null ? Number(base) : 0;
      const price = baseNum > 0 ? ` — a partir de ${formatBRL(baseNum)}/dia` : "";
      const cap = r.capacity ? `, ${r.capacity} vagas` : "";
      return `• ${pt.name}${cap}${price}`;
    });
    items.push({
      id: `auto:${L.id}:parking-types`,
      scope: "auto",
      location_id: L.id,
      destination_id: null,
      question: "Quais tipos de vaga este estacionamento oferece?",
      answer: lines.join("\n"),
      sort_order: 2,
      category: AUTO_CATEGORY,
    });
  }

  // 3) Capacidade total
  const totalCapacity = lptRows.reduce(
    (acc, r) => acc + (r.capacity ?? 0),
    0,
  );
  if (totalCapacity > 0) {
    items.push({
      id: `auto:${L.id}:capacity`,
      scope: "auto",
      location_id: L.id,
      destination_id: null,
      question: "Quantas vagas tem este estacionamento?",
      answer: `Total de ${totalCapacity} vagas distribuídas entre os tipos de vaga disponíveis.`,
      sort_order: 3,
      category: AUTO_CATEGORY,
    });
  }

  // 4) Estadia mínima (se algum LPT tiver)
  const minStays = validLpts
    .filter((r) => r.has_minimum_stay && r.minimum_stay_value && r.minimum_stay_unit)
    .map((r) => {
      const pt = r.company_parking_type!.parking_type!;
      const v = r.minimum_stay_value!;
      const u = pluralUnit(v, r.minimum_stay_unit!);
      return `• ${pt.name}: mínimo de ${v} ${u}`;
    });
  if (minStays.length > 0) {
    items.push({
      id: `auto:${L.id}:min-stay`,
      scope: "auto",
      location_id: L.id,
      destination_id: null,
      question: "Existe estadia mínima neste estacionamento?",
      answer: minStays.join("\n"),
      sort_order: 4,
      category: AUTO_CATEGORY,
    });
  }

  // 5) Amenidades
  const validAm = amRows.filter((a) => a.amenity);
  if (validAm.length > 0) {
    const lines = validAm.map((a) => {
      const n = a.amenity!.name;
      return a.notes ? `• ${n} — ${a.notes}` : `• ${n}`;
    });
    items.push({
      id: `auto:${L.id}:amenities`,
      scope: "auto",
      location_id: L.id,
      destination_id: null,
      question: "Quais comodidades este estacionamento oferece?",
      answer: lines.join("\n"),
      sort_order: 5,
      category: AUTO_CATEGORY,
    });
  }

  // 6) Contato
  if (L.phone || L.email) {
    const parts: string[] = [];
    if (L.phone) parts.push(`Telefone: ${L.phone}`);
    if (L.email) parts.push(`E-mail: ${L.email}`);
    items.push({
      id: `auto:${L.id}:contact`,
      scope: "auto",
      location_id: L.id,
      destination_id: null,
      question: "Como entro em contato com este estacionamento?",
      answer: parts.join("\n"),
      sort_order: 6,
      category: AUTO_CATEGORY,
    });
  }

  // 7) Aviso operacional
  if (L.has_notice && L.notice) {
    items.push({
      id: `auto:${L.id}:notice`,
      scope: "auto",
      location_id: L.id,
      destination_id: null,
      question: "Há algum aviso importante sobre este estacionamento?",
      answer: L.notice,
      sort_order: 7,
      category: AUTO_CATEGORY,
    });
  }

  // 8) Política de reserva
  if (L.reservation_policy) {
    items.push({
      id: `auto:${L.id}:policy`,
      scope: "auto",
      location_id: L.id,
      destination_id: null,
      question: "Qual a política de reserva deste estacionamento?",
      answer: L.reservation_policy,
      sort_order: 8,
      category: AUTO_CATEGORY,
    });
  }

  return items;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")
    return jsonResponse({ error: { message: "Method not allowed" } }, 405);

  // @ts-expect-error - Deno global
  const url = Deno.env.get("SUPABASE_URL");
  // @ts-expect-error - Deno global
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey)
    return jsonResponse({ error: { message: "Server not configured" } }, 500);

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* payload vazio é OK — só globais */
  }

  // Normaliza strings vazias pra undefined (o MCP envia "" pra campos opcionais)
  const locationId = body.location_id?.trim() || undefined;
  const categorySlug = body.category_slug?.trim() || undefined;
  const queryStr = body.query?.trim() || undefined;

  const supa = createClient(url, anonKey, { auth: { persistSession: false } });

  const limit = Math.min(Math.max(body.limit ?? 100, 1), 200);

  // Resolve o destino: explícito (página do destino) ou herdado da location (listing).
  let destinationId = body.destination_id?.trim() || undefined;
  if (locationId && !destinationId) {
    const { data: locRow } = await supa
      .from("location")
      .select("destination_id")
      .eq("id", locationId)
      .maybeSingle();
    destinationId = (locRow?.destination_id as string | null) ?? undefined;
  }

  // --- 1) FAQs cadastradas (global + destination + location-specific)
  let q = supa
    .from("faq")
    .select(
      "id, scope, location_id, destination_id, question, answer, sort_order, category:faq_category(slug, label, sort_order)",
    )
    .eq("is_published", true)
    .is("deleted_at", null);

  const ors = ["scope.eq.global"];
  if (locationId) ors.push(`location_id.eq.${locationId}`);
  if (destinationId) ors.push(`and(scope.eq.destination,destination_id.eq.${destinationId})`);
  if (ors.length > 1) {
    q = q.or(ors.join(","));
  } else {
    q = q.eq("scope", "global");
  }

  if (queryStr && queryStr.length >= 2) {
    const escaped = queryStr.replace(/[%_]/g, (m) => `\\${m}`);
    q = q.ilike("question", `%${escaped}%`);
  }

  const { data: dbRows, error } = await q.limit(limit);
  if (error) return jsonResponse({ error: { message: error.message } }, 500);

  const dbItems = (dbRows ?? []) as FaqItem[];

  // --- 2) Q&As autogeradas (só com location_id)
  const autoItems = locationId
    ? await buildAutoFaq(supa, locationId).catch((e) => {
        console.error("buildAutoFaq error:", e);
        return [] as FaqItem[];
      })
    : [];

  // Aplica busca às auto items também
  const filteredAuto =
    queryStr && queryStr.length >= 2
      ? autoItems.filter(
          (i) =>
            i.question.toLowerCase().includes(queryStr.toLowerCase()) ||
            i.answer.toLowerCase().includes(queryStr.toLowerCase()),
        )
      : autoItems;

  let combined: FaqItem[] = [...filteredAuto, ...dbItems];

  // Filtro por categoria — auto items só batem se categorySlug === 'este-estacionamento'
  if (categorySlug) {
    combined = combined.filter(
      (i) => i.category?.slug === categorySlug,
    );
  }

  // Dedupe (ADR-002): mesma pergunta em mais de um escopo → mantém a mais específica
  // (location sobrescreve destination sobrescreve global). 'auto' nunca colide.
  const specificity: Record<string, number> = { location: 0, destination: 1, global: 2, auto: 3 };
  const byQuestion = new Map<string, FaqItem>();
  for (const it of combined) {
    const k = it.question.trim().toLowerCase();
    const cur = byQuestion.get(k);
    if (!cur || (specificity[it.scope] ?? 9) < (specificity[cur.scope] ?? 9)) {
      byQuestion.set(k, it);
    }
  }
  combined = [...byQuestion.values()];

  // Ordenação custom: auto → location → destination → global, depois categoria e sort_order
  const scopeWeight: Record<string, number> = { auto: 0, location: 1, destination: 2, global: 3 };
  combined.sort((a, b) => {
    const sa = scopeWeight[a.scope] ?? 9;
    const sb = scopeWeight[b.scope] ?? 9;
    if (sa !== sb) return sa - sb;
    const ca = a.category?.sort_order ?? 999;
    const cb = b.category?.sort_order ?? 999;
    if (ca !== cb) return ca - cb;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  return jsonResponse(
    { items: combined, count: combined.length },
    200,
    { "Cache-Control": "public, max-age=60, s-maxage=60" },
  );
});
