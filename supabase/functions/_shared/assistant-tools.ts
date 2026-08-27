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

import { siteUrl } from "./site.ts";

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

// Codes válidos de tipo de vaga (tabela parking_type). Viram enum no schema das tools para o modelo
// mandar o code, não o nome em português: "coberta" quebrava simulate_price (keyed em code exato).
export const PARKING_TYPE_CODES = [
  "covered",
  "uncovered",
  "valet",
  "garage",
  "premium",
  "motorcycle",
];

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
        category: {
          type: "array",
          items: { type: "string", enum: PARKING_TYPE_CODES },
          description:
            "codes do tipo de vaga (coberta=covered, descoberta=uncovered, valet=valet, garagem/box=garage, premium=premium, moto=motorcycle)",
        },
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
        parking_type: {
          type: "string",
          enum: PARKING_TYPE_CODES,
          description:
            "code do tipo de vaga (coberta=covered, descoberta=uncovered, valet=valet, garagem/box=garage, premium=premium, moto=motorcycle)",
        },
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
    name: "search_knowledge",
    description:
      "Busca semântica na base de conhecimento (direções de acesso, políticas, avisos e FAQ em prosa). Use para perguntas abertas, em linguagem natural, que o get_faq estruturado não cobre bem. Passe location_id/destination_id para focar numa unidade ou destino.",
    parameters: obj(
      {
        query: S("pergunta em linguagem natural"),
        location_id: S("id da unidade (opcional)"),
        destination_id: S("id do destino (opcional)"),
        k: INT("máximo de trechos (default 6)"),
      },
      ["query"],
    ),
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
    name: "get_location_info",
    description:
      "Ficha completa de UMA unidade: contato (telefone e e-mail), horário de funcionamento, " +
      "tolerância na saída, como chegar, traslado (van), aviso operacional e política de reserva. " +
      "Use sempre que o cliente pedir o contato da unidade, o horário, ou qualquer detalhe que a " +
      "lista não traz. Passe `location_id` (de list_locations) ou `slug`.",
    parameters: obj({
      location_id: S("id da unidade, vindo de list_locations"),
      slug: S("slug da unidade, alternativa ao id (ex.: nationpark)"),
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
  {
    name: "search_blog",
    description:
      "Busca guias do blog da Movepark sobre estacionamento em aeroportos (preço da diária, traslado, vaga coberta, valet, como reservar). Use para responder dúvida geral do viajante e citar a fonte. Devolve título, resumo e URL, sem o corpo.",
    parameters: obj({
      q: S("Termo livre; casa título e resumo"),
      destination: S("slug do destino, ex.: aeroporto-de-viracopos"),
      category: S("slug da categoria: precos, comparativos, guias, dicas-de-viagem, como-reservar"),
      tag: S("slug da tag, ex.: traslado, vaga-coberta, economia"),
      limit: INT("máximo de resultados (padrão 5)"),
    }),
  },
  {
    name: "get_blog_post",
    description:
      "Devolve um post do blog por slug, com o texto completo em Markdown. Use depois de search_blog quando precisar do conteúdo para responder, e cite a URL.",
    parameters: obj({ slug: S("slug do post") }, ["slug"]),
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



interface BlogRow {
  slug: string;
  tags?: { tag: { slug: string; name: string } }[];
  [k: string]: unknown;
}

/** O PostgREST devolve a N:N aninhada (`{ tag: {...} }`); o modelo lê melhor plano. */
function withFlatTags(row: BlogRow): BlogRow & { tags: { slug: string; name: string }[] } {
  return { ...row, tags: (row.tags ?? []).map((t) => t.tag).filter(Boolean) };
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

    case "simulate_price": {
      const sim = unwrap(
        await sb.rpc("simulate_price", {
          p_company: a.company,
          p_location: a.location ?? null,
          p_parking_type: a.parking_type ?? null,
          p_days: Number(a.days ?? 1),
        }),
      ) as { error?: string } | null;

      // O motor é keyed em slug/code exatos e devolve só "não encontrado". O modelo chuta
      // "congonhas" em vez de "aeroporto-congonhas" e o usuário ouve "não consegui simular o preço"
      // numa unidade que TEM preço (achado §18-1.1/1.3). Aqui o erro passa a dizer o que serve.
      // A resolução não entra no motor de propósito: pricing tem casos golden, e afrouxar a chave lá
      // mudaria o que a busca cobra. Quem tolera o termo humano é a camada do agente.
      if (sim?.error) {
        const opcoes = unwrap(
          await sb
            .from("location")
            .select("slug, company:company_id!inner(slug)")
            .eq("company.slug", String(a.company ?? "").trim().toLowerCase())
            .is("deleted_at", null)
            .limit(10),
        ) as Array<{ slug: string }>;
        const dica = opcoes.length
          ? ` Unidades desta empresa: ${opcoes.map((o) => o.slug).join(", ")}.`
          : " Use list_companies para ver as empresas e list_locations para as unidades.";
        return { ...sim, error: `${sim.error}.${dica}` };
      }
      return sim;
    }

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

    case "search_knowledge":
      // A embedding da query precisa da GEMINI_API_KEY (env de Edge), que o client anon do chat/MCP
      // não tem: a busca semântica roda na Edge dedicada, igual get_faq -> get-faq.
      return unwrap(
        await sb.functions.invoke("knowledge-search", {
          body: {
            query: a.query ?? "",
            location_id: a.location_id ?? null,
            destination_id: a.destination_id ?? null,
            k: a.k ?? 6,
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

    /**
     * A ficha da unidade, com o que a lista não carrega.
     *
     * Existe porque `list_locations` é DESCOBERTA: ela responde "quais unidades existem
     * e onde ficam", e carregar contato, horário, traslado e avisos em cinquenta linhas
     * inflaria toda conversa para servir a pergunta de uma. Aqui é uma unidade, e cabe
     * tudo.
     *
     * O buraco que ela fecha era visível: a Nationpark tem telefone e e-mail cadastrados
     * no Manager, e a Mia respondia "não localizei canais de contato direto para esta
     * unidade". Ela não estava inventando, estava dizendo a verdade sobre o que o select
     * devolvia.
     */
    case "get_location_info": {
      const porId = typeof a.location_id === "string" && a.location_id.trim();
      const porSlug = typeof a.slug === "string" && a.slug.trim();
      if (!porId && !porSlug) {
        return { error: "Passe location_id (de list_locations) ou slug da unidade." };
      }

      let q = sb
        .from("location")
        .select(
          "id, name, slug, address, address_complement, latitude, longitude, google_maps_url, " +
            "phone, email, is_24h, business_hours, tolerance_minutes, directions_text, " +
            "has_shuttle, shuttle_frequency_minutes, shuttle_to_terminal_minutes, " +
            "has_notice, notice, reservation_policy, review_avg, review_count, " +
            "company:company_id!inner(name, slug), destination:destination_id(short_name, code, city)",
        )
        .is("deleted_at", null)
        /**
         * Dois, e não um, quando a busca é por slug.
         *
         * **O slug não é único.** Medido em 27/08: `aeroporto-afonso-pena` pertence a
         * DUAS unidades (Abbapark e Nationpark), porque `location.name` guarda o nome do
         * aeroporto e não o do estacionamento. Com `limit(1)` a consulta devolveria uma
         * das duas, sempre sem erro, e a Mia daria ao cliente o telefone do concorrente.
         * Trazendo duas dá para perceber a ambiguidade e recusar.
         */
        .limit(porId ? 1 : 2);

      q = porId ? q.eq("id", a.location_id as string) : q.eq("slug", (a.slug as string).trim().toLowerCase());

      const r = unwrap(await q) as unknown;
      const linhas = Array.isArray(r) ? r : null;
      if (!linhas) return r;
      if (linhas.length > 1) {
        const quais = linhas
          .map((l) => {
            const e = (l as { company?: { name?: string } }).company?.name;
            return e ?? (l as { id?: string }).id;
          })
          .join(", ");
        return {
          error:
            `O slug "${a.slug}" pertence a mais de uma unidade (${quais}). ` +
            "Pergunte ao cliente de qual empresa é e chame de novo com o location_id de list_locations.",
        };
      }
      if (linhas.length === 0) {
        // Erro, e não lista vazia: o modelo lê "[]" como "a unidade não tem contato" e
        // repete isso ao cliente, que foi exatamente o que aconteceu antes desta tool.
        return { error: "Unidade não encontrada. Confira o id ou o slug em list_locations." };
      }

      const u = linhas[0] as Record<string, unknown>;
      // Aviso desligado não vai como texto: ele fica no banco depois de desligado, e
      // mandá-lo ao modelo faria a Mia anunciar um aviso que a unidade retirou.
      if (!u.has_notice) u.notice = null;
      return u;
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
      // O slug canônico é longo (`aeroporto-internacional-de-sao-paulo-guarulhos`) e o modelo tende a
      // chutar "guarulhos" ou "GRU". Antes disto ele levava "Destino não encontrado", e em contexto
      // poluído desistia em vez de consultar a lista (achado §18-1.2). Aqui o termo é resolvido por
      // slug, código, nome curto ou nome, e o erro passa a dizer quais existem (§18-1.3).
      const termo = String(a.slug ?? "").trim();
      let dest = termo
        ? (unwrap(
          await sb
            .from("destination")
            .select(`${DESTINATION_COLS}, intro`)
            .eq("slug", termo)
            .eq("is_published", true)
            .maybeSingle(),
        ) as { id?: string } | null)
        : null;

      if (!dest?.id && termo) {
        const like = `%${termo.replace(/[%_]/g, (c) => `\\${c}`)}%`;
        const candidatos = unwrap(
          await sb
            .from("destination")
            .select(`${DESTINATION_COLS}, intro`)
            .eq("is_published", true)
            .or(`slug.ilike.${like},code.ilike.${termo},short_name.ilike.${like},name.ilike.${like}`)
            .limit(2),
        ) as Array<{ id?: string }>;
        // Só resolve quando não há ambiguidade: dois candidatos viram erro instrutivo.
        if (candidatos.length === 1) dest = candidatos[0];
      }

      if (!dest?.id) {
        const opcoes = unwrap(
          await sb.from("destination").select("slug").eq("is_published", true).order("sort_order").limit(15),
        ) as Array<{ slug: string }>;
        throw new Error(
          `Destino não encontrado para "${termo}". Use um destes slugs: ${opcoes.map((o) => o.slug).join(", ")}.`,
        );
      }
      const points = unwrap(
        await sb
          .from("destination_point")
          .select("id, name, type, latitude, longitude")
          .eq("destination_id", dest.id),
      );
      return { ...dest, points };
    }

    case "search_blog": {
      // Sem `body_md`: são ~4 KB por post, e o modelo só precisa decidir qual
      // abrir. O corpo vem depois, por get_blog_post.
      let q = sb
        .from("blog_post")
        .select(
          "slug, title, excerpt, published_at," +
            " destination:destination(slug, name)," +
            " category:blog_category(slug, name)," +
            " tags:blog_post_tag(tag:blog_tag(slug, name))",
        )
        .eq("is_published", true)
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .limit(Number(a.limit ?? 5));

      if (a.destination) q = q.eq("destination.slug", String(a.destination));
      if (a.category) q = q.eq("category.slug", String(a.category));
      if (a.q) q = q.or(`title.ilike.%${a.q}%,excerpt.ilike.%${a.q}%`);

      let posts = (unwrap(await q) as BlogRow[]).map(withFlatTags);
      if (a.tag) posts = posts.filter((p) => p.tags.some((t) => t.slug === a.tag));

      return posts.map((p) => ({ ...p, url: `${siteUrl()}/blog/${p.slug}/` }));
    }

    case "get_blog_post": {
      const post = unwrap(
        await sb
          .from("blog_post")
          .select(
            "slug, title, excerpt, body_md, published_at," +
              " destination:destination(slug, name)," +
              " category:blog_category(slug, name)," +
              " author:blog_author(slug, name)," +
              " tags:blog_post_tag(tag:blog_tag(slug, name))",
          )
          .eq("slug", String(a.slug))
          .eq("is_published", true)
          .is("deleted_at", null)
          .maybeSingle(),
      ) as BlogRow | null;

      if (!post) throw new Error(`Post "${a.slug}" não encontrado. Use search_blog para achar o slug.`);
      return { ...withFlatTags(post), url: `${siteUrl()}/blog/${post.slug}/` };
    }

    case "current_datetime":
      return nowContext(now);

    default:
      throw new Error(`Tool de leitura desconhecida: ${name}`);
  }
}
