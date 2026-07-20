// Registro canônico das tools de LEITURA do consumidor.
//
// Fonte única para as duas superfícies que expõem descoberta ao agente:
//   - MCP consumidor  (supabase/functions/mcp, endpoint público)
//   - assistente web  (supabase/functions/chat, function-calling do Gemini)
//
// Antes cada uma tinha a própria cópia do catálogo e dos handlers, e elas
// divergiram: `current_datetime` só existia no chat; `category` de search_parking
// só no MCP; `list_locations`/`get_destination` selecionavam colunas diferentes.
// Aqui vale a versão mais completa; os adaptadores cuidam da diferença de formato.
//
// Lógica pura + acesso a dados via cliente injetado (`sb`), para dar teste.
// Ver docs/specs/mcp.md e docs/specs/chatbot.md.

export interface ReadToolDef {
  name: string;
  description: string;
  // JSON Schema do input. NÃO carrega `additionalProperties`: o Gemini rejeita
  // esse campo. O adaptador do MCP adiciona quando converte.
  parameters: Record<string, unknown>;
}

function obj(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties, required };
}

const S = (description?: string) => (description ? { type: "string", description } : { type: "string" });
const INT = (description?: string) =>
  description ? { type: "integer", description } : { type: "integer" };
const DT = (description: string) => ({ type: "string", format: "date-time", description });

export const READ_TOOLS: ReadToolDef[] = [
  {
    name: "search_parking",
    description:
      "Busca estacionamentos por destino (código de aeroporto como GRU/CGH ou cidade) e período, com preço, distância e disponibilidade. Use antes de simular preço ou reservar.",
    parameters: obj(
      {
        dest: S("Código do aeroporto (ex.: GRU) ou cidade"),
        from: DT("Check-in (ISO-8601)"),
        to: DT("Check-out (ISO-8601)"),
        vehicle: { type: "string", enum: ["car", "motorcycle"] },
        category: { type: "array", items: S(), description: "covered/uncovered/valet" },
        max_distance_km: { type: "number" },
        limit: INT("máximo de resultados"),
      },
      ["dest", "from", "to"],
    ),
  },
  {
    name: "simulate_price",
    description: "Simula o preço de uma reserva por empresa/unidade/tipo de vaga e nº de diárias.",
    parameters: obj(
      {
        company: S("slug da empresa"),
        location: S("slug da unidade"),
        parking_type: S("code do tipo de vaga (ex.: covered)"),
        days: { type: "integer", minimum: 1, default: 1, description: "número de diárias" },
      },
      ["company"],
    ),
  },
  {
    name: "get_faq",
    description: "Perguntas frequentes (global ou de uma unidade específica).",
    parameters: obj({
      location_id: S("id da unidade"),
      query: S("termo de busca"),
      limit: INT("máximo de resultados"),
    }),
  },
  {
    name: "list_companies",
    description: "Lista os estacionamentos parceiros (empresas) ativos da plataforma.",
    parameters: obj({ limit: INT("máximo de resultados") }),
  },
  {
    name: "list_locations",
    description:
      "Lista unidades (estacionamentos) ativas, com a empresa e o destino de cada uma. Passe `company` (slug, ex.: aerovalet) para ver só as unidades daquela empresa e onde ela atua.",
    parameters: obj({
      company: S("slug da empresa para filtrar (opcional, ex.: aerovalet)"),
      limit: INT("máximo de resultados"),
    }),
  },
  {
    name: "get_parking_types",
    description:
      "Tipos de vaga de uma unidade (coberto, descoberto, valet). Devolve os ids usados para reservar.",
    parameters: obj({ location_id: S("id da unidade") }, ["location_id"]),
  },
  {
    name: "list_destinations",
    description: "Lista destinos (aeroportos/cidades) atendidos, com slug e localização.",
    parameters: obj({ limit: INT("máximo de resultados") }),
  },
  {
    name: "get_destination",
    description: "Detalhe de um destino pelo slug, com seus pontos/terminais.",
    parameters: obj({ slug: S("slug do destino") }, ["slug"]),
  },
  {
    name: "current_datetime",
    description:
      "Data e hora atuais no fuso de São Paulo. Use para resolver datas relativas como 'amanhã' ou 'sexta que vem' sem perguntar ao usuário.",
    parameters: obj({}),
  },
];

export const READ_TOOL_NAMES = new Set(READ_TOOLS.map((t) => t.name));

// ── Adaptadores de formato ───────────────────────────────────────────────────

/** MCP: o campo é `inputSchema` e o schema é fechado. */
export function toMcpToolDef(t: ReadToolDef): {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
} {
  return {
    name: t.name,
    description: t.description,
    inputSchema: { ...t.parameters, additionalProperties: false },
  };
}

/** Gemini: o campo é `parameters` e `additionalProperties` não é aceito. */
export function toGeminiDecl(t: ReadToolDef): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return { name: t.name, description: t.description, parameters: t.parameters };
}

// ── Contexto temporal ────────────────────────────────────────────────────────

export const DEFAULT_TZ = "America/Sao_Paulo";

export interface NowContext {
  iso: string; // ISO-8601 com offset (-03:00, sem horário de verão desde 2019)
  date: string; // dd/mm/aaaa
  time: string; // HH:MM
  weekday: string; // ex.: "terça-feira"
  timezone: string;
}

/** Data/hora atual no fuso informado, de forma determinística (testável com um Date fixo). */
export function nowContext(now: Date, timeZone = DEFAULT_TZ): NowContext {
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone, ...opts }).format(now);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}-03:00`,
    date: fmt({ day: "2-digit", month: "2-digit", year: "numeric" }),
    time: fmt({ hour: "2-digit", minute: "2-digit", hour12: false }),
    weekday: fmt({ weekday: "long" }),
    timezone: timeZone,
  };
}

// ── Handler único de leitura ─────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type Sb = any;

function unwrap<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

const DESTINATION_COLS =
  "id, code, name, short_name, slug, type, city, state, country, latitude, longitude";

/**
 * Executa uma tool de leitura. `sb` é o cliente Supabase já configurado pelo
 * chamador (anon no MCP público e no chat; anon com Authorization quando houver
 * usuário). Nenhuma das tools daqui exige sessão.
 */
export async function callRead(
  sb: Sb,
  name: string,
  a: Record<string, unknown>,
  now: Date = new Date(),
): Promise<unknown> {
  switch (name) {
    case "search_parking":
      return unwrap(
        await sb.functions.invoke("search", {
          body: {
            dest: a.dest,
            from: a.from,
            to: a.to,
            vehicle: a.vehicle,
            category: a.category,
            max_distance_km: a.max_distance_km,
            limit: a.limit ?? 20,
          },
        }),
      );

    case "simulate_price":
      return unwrap(
        await sb.rpc("simulate_price", {
          p_company: a.company,
          p_location: a.location ?? null,
          p_parking_type: a.parking_type ?? null,
          p_days: Number(a.days ?? 1),
        }),
      );

    case "get_faq":
      return unwrap(
        await sb.functions.invoke("get-faq", {
          body: {
            location_id: a.location_id ?? null,
            query: a.query ?? null,
            limit: a.limit ?? 20,
          },
        }),
      );

    case "list_companies":
      return unwrap(
        await sb.from("company").select("id, name, slug").order("name").limit(Number(a.limit ?? 50)),
      );

    case "list_locations": {
      // `!inner` filtra no banco (locations sempre têm empresa); destino fica left join (pode faltar).
      let q = sb
        .from("location")
        .select(
          "id, name, slug, address, latitude, longitude, company:company_id!inner(name, slug), destination:destination_id(short_name, code, city)",
        )
        .is("deleted_at", null)
        .order("name")
        .limit(Number(a.limit ?? 50));
      // Filtro opcional por empresa (slug), pra responder "onde a Aerovalet atua?". Slug é minúsculo;
      // normaliza a entrada pra casar "Aerovalet" com "aerovalet".
      if (typeof a.company === "string" && a.company.trim()) {
        q = q.eq("company.slug", a.company.trim().toLowerCase());
      }
      return unwrap(await q);
    }

    case "get_parking_types":
      return unwrap(
        await sb
          .from("location_parking_type")
          .select(
            "id, capacity, is_active, company_parking_type:company_parking_type_id(parking_type:parking_type_id(code, name))",
          )
          .eq("location_id", a.location_id as string),
      );

    case "list_destinations":
      return unwrap(
        await sb
          .from("destination")
          .select(DESTINATION_COLS)
          .eq("is_published", true)
          .order("sort_order")
          .limit(Number(a.limit ?? 50)),
      );

    case "get_destination": {
      const dest = unwrap(
        await sb
          .from("destination")
          .select(`${DESTINATION_COLS}, intro`)
          .eq("slug", a.slug as string)
          .eq("is_published", true)
          .maybeSingle(),
      ) as { id?: string } | null;
      if (!dest?.id) throw new Error("Destino não encontrado.");
      const points = unwrap(
        await sb
          .from("destination_point")
          .select("id, name, type, latitude, longitude")
          .eq("destination_id", dest.id),
      );
      return { ...dest, points };
    }

    case "current_datetime":
      return nowContext(now);

    default:
      throw new Error(`Tool de leitura desconhecida: ${name}`);
  }
}
