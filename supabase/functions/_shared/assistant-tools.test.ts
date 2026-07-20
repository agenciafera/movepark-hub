// Testes do registro canônico de tools de leitura (_shared/assistant-tools.ts).
// Roda com `bun run test:edge` (deno test). Sem rede: o cliente Supabase é um stub
// que grava a chamada em vez de executá-la.

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  callRead,
  nowContext,
  READ_TOOLS,
  toGeminiDecl,
  toMcpToolDef,
} from "./assistant-tools.ts";

// ── Registro ─────────────────────────────────────────────────────────────────

Deno.test("READ_TOOLS: nomes únicos", () => {
  const names = READ_TOOLS.map((t) => t.name);
  assertEquals(names.length, new Set(names).size);
});

Deno.test("READ_TOOLS: toda tool tem descrição e schema de objeto", () => {
  for (const t of READ_TOOLS) {
    assertEquals(typeof t.description === "string" && t.description.length > 0, true, t.name);
    assertEquals((t.parameters as { type?: string }).type, "object", t.name);
  }
});

// ── Adaptadores ──────────────────────────────────────────────────────────────

Deno.test("toMcpToolDef: schema fechado (additionalProperties: false)", () => {
  const d = toMcpToolDef(READ_TOOLS[0]);
  assertEquals(d.inputSchema.additionalProperties, false);
  assertEquals(d.name, READ_TOOLS[0].name);
});

Deno.test("toGeminiDecl: sem additionalProperties (o Gemini rejeita o campo)", () => {
  for (const t of READ_TOOLS) {
    const d = toGeminiDecl(t);
    assertEquals("additionalProperties" in d.parameters, false, t.name);
  }
});

Deno.test("os adaptadores não vazam um no outro: o registro segue sem additionalProperties", () => {
  READ_TOOLS.forEach(toMcpToolDef);
  for (const t of READ_TOOLS) {
    assertEquals("additionalProperties" in t.parameters, false, t.name);
  }
});

// ── callRead ─────────────────────────────────────────────────────────────────

/** Stub que registra a última chamada e devolve `data` vazio. */
function stubSb() {
  const calls: Record<string, unknown>[] = [];
  const chain = (table: string) => {
    const rec: Record<string, unknown> = { table };
    calls.push(rec);
    const self: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "limit"]) {
      self[m] = (...args: unknown[]) => {
        rec[m] = args[0];
        return self;
      };
    }
    self.maybeSingle = () => Promise.resolve({ data: { id: "d1" }, error: null });
    // await de um query builder resolve como thenable
    self.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
    return self;
  };
  return {
    calls,
    from: (t: string) => chain(t),
    rpc: (fn: string, args: unknown) => {
      calls.push({ rpc: fn, args });
      return Promise.resolve({ data: [], error: null });
    },
    functions: {
      invoke: (fn: string, opts: { body: unknown }) => {
        calls.push({ invoke: fn, body: opts.body });
        return Promise.resolve({ data: {}, error: null });
      },
    },
  };
}

Deno.test("callRead: search_parking repassa category (que o chat perdia)", async () => {
  const sb = stubSb();
  await callRead(sb, "search_parking", {
    dest: "GRU",
    from: "2026-08-01T10:00:00Z",
    to: "2026-08-03T10:00:00Z",
    category: ["covered"],
  });
  const body = sb.calls[0].body as Record<string, unknown>;
  assertEquals(sb.calls[0].invoke, "search");
  assertEquals(body.category, ["covered"]);
  assertEquals(body.limit, 20);
});

Deno.test("callRead: list_locations traz latitude/longitude", async () => {
  const sb = stubSb();
  await callRead(sb, "list_locations", {});
  const sel = String(sb.calls[0].select);
  assertEquals(sel.includes("latitude"), true);
  assertEquals(sel.includes("longitude"), true);
});

Deno.test("callRead: list_destinations traz short_name, country e geo", async () => {
  const sb = stubSb();
  await callRead(sb, "list_destinations", {});
  const sel = String(sb.calls[0].select);
  for (const col of ["short_name", "country", "latitude", "longitude"]) {
    assertEquals(sel.includes(col), true, col);
  }
});

Deno.test("callRead: get_destination traz geo nos pontos/terminais", async () => {
  const sb = stubSb();
  await callRead(sb, "get_destination", { slug: "aeroporto-de-congonhas" });
  const points = sb.calls[1];
  assertEquals(points.table, "destination_point");
  assertEquals(String(points.select).includes("latitude"), true);
});

Deno.test("callRead: simulate_price manda os defaults da RPC", async () => {
  const sb = stubSb();
  await callRead(sb, "simulate_price", { company: "virapark" });
  assertEquals(sb.calls[0].rpc, "simulate_price");
  assertEquals((sb.calls[0].args as Record<string, unknown>).p_days, 1);
});

Deno.test("callRead: current_datetime usa o Date injetado (determinístico)", async () => {
  const out = (await callRead(stubSb(), "current_datetime", {}, new Date("2026-06-24T17:30:00Z"))) as {
    date: string;
    timezone: string;
  };
  assertEquals(out.date, "24/06/2026");
  assertEquals(out.timezone, "America/Sao_Paulo");
});

Deno.test("callRead: tool desconhecida falha alto", async () => {
  await assertRejects(() => callRead(stubSb(), "nao_existe", {}), Error, "desconhecida");
});

Deno.test("callRead: toda tool do registro tem handler", async () => {
  const args: Record<string, Record<string, unknown>> = {
    search_parking: { dest: "GRU", from: "x", to: "y" },
    get_parking_types: { location_id: "l1" },
    get_destination: { slug: "s" },
    simulate_price: { company: "c" },
  };
  for (const t of READ_TOOLS) {
    await callRead(stubSb(), t.name, args[t.name] ?? {});
  }
});

// ── Contexto temporal (movido do chat; o comportamento não pode mudar) ───────

Deno.test("nowContext: fuso de São Paulo com offset -03:00", () => {
  const n = nowContext(new Date("2026-06-24T17:30:00Z"));
  assertEquals(n.iso, "2026-06-24T14:30:00-03:00");
  assertEquals(n.date, "24/06/2026");
  assertEquals(n.time, "14:30");
  assertEquals(n.timezone, "America/Sao_Paulo");
});
