// deno test: partes puras do cliente WL.
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAvailabilityUrl,
  buildOrdersUrl,
  parseOrdersPage,
  wlListOrders,
  wlMarkAttendance,
  wlChangeLicensePlate,
  WlHttpError,
  wlErrorStatus,
  wlPostSync,
  normalizeWlDomain,
  parseAvailabilityResponse,
  parseCategories,
  parseCategoryProducts,
  parseMinimumStayDays,
  wlReady,
  wlAllowedHost,
  hasInternalKey,
} from "./client.ts";

Deno.test("normalizeWlDomain tira protocolo/path/caixa", () => {
  assertEquals(
    normalizeWlDomain("https://ferapark.movepark.com.br/api/v3/backend"),
    "ferapark.movepark.com.br",
  );
  assertEquals(normalizeWlDomain("FeraPark.Movepark.com.br/"), "ferapark.movepark.com.br");
  assertEquals(normalizeWlDomain(""), null);
  assertEquals(normalizeWlDomain(null), null);
});

Deno.test("wlReady exige toggle + domínio permitido + tenant", () => {
  const d = "parceiro-app.movepark.co";
  assertEquals(wlReady({ wl_domain: d, wl_tenant_key: "t", wl_sync_enabled: true }), true);
  assertEquals(wlReady({ wl_domain: d, wl_tenant_key: "t", wl_sync_enabled: false }), false);
  assertEquals(wlReady({ wl_domain: null, wl_tenant_key: "t", wl_sync_enabled: true }), false);
  assertEquals(wlReady({ wl_domain: d, wl_tenant_key: null, wl_sync_enabled: true }), false);
  // Domínio fora do canônico não é pronto: o Bearer global não sai para ele.
  assertEquals(wlReady({ wl_domain: "x.com", wl_tenant_key: "t", wl_sync_enabled: true }), false);
});

Deno.test("wlAllowedHost: só hostname puro sob o domínio canônico", () => {
  const base = "movepark.co";
  assertEquals(wlAllowedHost("https://Parceiro-App.movepark.co/api", base), "parceiro-app.movepark.co");
  assertEquals(wlAllowedHost("movepark.co", base), "movepark.co");
  assertEquals(wlAllowedHost("evil.com", base), null);
  assertEquals(wlAllowedHost("movepark.co.evil.com", base), null, "sufixo tem que ser o fim do host");
  assertEquals(wlAllowedHost("evilmovepark.co", base), null, "sem o ponto não é subdomínio");
  assertEquals(wlAllowedHost("user@parceiro-app.movepark.co", base), null);
  assertEquals(wlAllowedHost("parceiro-app.movepark.co:8443", base), null);
  assertEquals(wlAllowedHost("10.0.0.1", base), null);
  assertEquals(wlAllowedHost(null, base), null);
});

Deno.test("hasInternalKey compara a chave inteira", () => {
  const req = (k?: string) => new Request("https://x", { headers: k ? { "x-wl-deliver-key": k } : {} });
  assertEquals(hasInternalKey(req("segredo"), "segredo"), true);
  assertEquals(hasInternalKey(req("segredX"), "segredo"), false);
  assertEquals(hasInternalKey(req("segredo-a-mais"), "segredo"), false);
  assertEquals(hasInternalKey(req(), "segredo"), false);
  assertEquals(hasInternalKey(req("qualquer"), undefined), false, "sem chave configurada, recusa tudo");
});

Deno.test("chamada a host fora da lista não sai", async () => {
  let called = false;
  await withFetch(
    (() => {
      called = true;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch,
    async () => {
      await assertRejects(() => wlPostSync({ ...cfg, wl_domain: "evil.com" }, "token", body));
    },
  );
  assertEquals(called, false);
});

Deno.test("buildAvailabilityUrl monta query com path fixo", () => {
  const url = buildAvailabilityUrl("ferapark-app.movepark.co", {
    category_slug: "unidade-aeroporto",
    product_slug: "vaga-coberta",
    start_date: "2026-06-22",
    end_date: "2026-07-05",
  });
  assertEquals(
    url,
    "https://ferapark-app.movepark.co/api/v3/backend/availability?category_slug=unidade-aeroporto&product_slug=vaga-coberta&start_date=2026-06-22&end_date=2026-07-05",
  );
});

Deno.test("buildAvailabilityUrl omite product/end opcionais", () => {
  const url = buildAvailabilityUrl("parceiro-app.movepark.co", { category_slug: "c", start_date: "2026-06-22" });
  assertEquals(url, "https://parceiro-app.movepark.co/api/v3/backend/availability?category_slug=c&start_date=2026-06-22");
});

Deno.test("parseAvailabilityResponse aceita array, {data} e {days}", () => {
  const row = { date: "2026-06-22", capacity: 1100, sold_wl: 3, sold_external: 1, available: 1096 };
  const expected = [{ date: "2026-06-22", capacity: 1100, sold_wl: 3, sold_external: 1, available: 1096 }];
  assertEquals(parseAvailabilityResponse([row]), expected);
  assertEquals(parseAvailabilityResponse({ data: [row] }), expected);
  assertEquals(parseAvailabilityResponse({ days: [row] }), expected);
  assertEquals(parseAvailabilityResponse(null), []);
  assertEquals(parseAvailabilityResponse({}), []);
});

Deno.test("parseAvailabilityResponse extrai data.units[].days[] (shape real do WL)", () => {
  const json = {
    data: {
      category_slug: "virapark",
      units: [
        {
          product_slug: "vaga-coberta",
          days: [
            { date: "2026-06-22", capacity: 1100, sold_wl: 834, sold_external: 0, available: 266 },
            { date: "2026-06-23", capacity: 1100, sold_wl: 767, sold_external: 0, available: 333 },
          ],
        },
      ],
    },
  };
  assertEquals(parseAvailabilityResponse(json), [
    { date: "2026-06-22", capacity: 1100, sold_wl: 834, sold_external: 0, available: 266 },
    { date: "2026-06-23", capacity: 1100, sold_wl: 767, sold_external: 0, available: 333 },
  ]);
});

Deno.test("parseAvailabilityResponse filtra a unidade pelo product_slug pedido", () => {
  const json = {
    data: {
      units: [
        { product_slug: "vaga-coberta", days: [{ date: "2026-06-22", sold_wl: 834 }] },
        { product_slug: "vaga-descoberta", days: [{ date: "2026-06-22", sold_wl: 12 }] },
      ],
    },
  };
  // pedindo coberta, NÃO pode vir a descoberta (evita sobrescrever sold_wl da mesma data)
  assertEquals(parseAvailabilityResponse(json, "vaga-coberta"), [
    { date: "2026-06-22", capacity: 0, sold_wl: 834, sold_external: 0, available: 0 },
  ]);
  // sem product_slug → comportamento antigo (todas as unidades)
  assertEquals(parseAvailabilityResponse(json).length, 2);
});

Deno.test("parseAvailabilityResponse coage tipos/ausências", () => {
  assertEquals(parseAvailabilityResponse([{ date: "2026-06-22" }]), [
    { date: "2026-06-22", capacity: 0, sold_wl: 0, sold_external: 0, available: 0 },
  ]);
});

Deno.test("parseCategories desembrulha {data:[...]} e filtra sem slug", () => {
  assertEquals(parseCategories({ data: [{ slug: "unidade-aeroporto", name: "Unidade aeroporto" }] }), [
    { slug: "unidade-aeroporto", name: "Unidade aeroporto" },
  ]);
  // sem name → usa slug; sem slug → descartado
  assertEquals(parseCategories({ data: [{ slug: "x" }, { name: "sem slug" }] }), [
    { slug: "x", name: "x" },
  ]);
  assertEquals(parseCategories(null), []);
});

Deno.test("parseCategoryProducts pega data.products aninhado e injeta a categoria", () => {
  const json = {
    data: {
      slug: "unidade-aeroporto",
      products: [
        { slug: "vaga-coberta", name: "Vaga coberta" },
        { slug: "vaga-descoberta", name: "Vaga descoberta" },
      ],
    },
  };
  assertEquals(parseCategoryProducts(json, "unidade-aeroporto"), [
    { slug: "vaga-coberta", name: "Vaga coberta", category_slug: "unidade-aeroporto" },
    { slug: "vaga-descoberta", name: "Vaga descoberta", category_slug: "unidade-aeroporto" },
  ]);
  assertEquals(parseCategoryProducts({ data: {} }, "u"), []);
  assertEquals(parseCategoryProducts(null, "u"), []);
});

Deno.test("parseMinimumStayDays lê o piso do 400 do parceiro", () => {
  // Corpo REAL do Abbapark, byte a byte, capturado em 10/08/2026 pedindo 1 diária. Repare nos
  // `í`: o October escapa os acentos, e é por isso que este teste não pode ser escrito com
  // `JSON.stringify` de um objeto com "í" (o stringify preserva o acento e o servidor não).
  // A primeira versão do parser passava naquele teste e falhava nas dez vagas de produção.
  const body =
    '{"errors":{"message":"Oops! Parece que algo deu errado. Por favor, verifique os campos ' +
    'abaixo e corrija os erros indicados.","fields":[{"field":"reservas",' +
    '"message":"Per\\u00edodo m\\u00ednimo de perman\\u00eancia: 3 dia(s)"}]}}';
  assertEquals(parseMinimumStayDays(body), 3);
});

Deno.test("parseMinimumStayDays também acha o piso quando o corpo não é JSON", () => {
  // Rede de segurança para o dia em que o parceiro devolver página de exceção em HTML.
  assertEquals(parseMinimumStayDays("<h1>Período mínimo de permanência: 4 dia(s)</h1>"), 4);
});

Deno.test("parseMinimumStayDays aguenta o texto sem acento e com espaçamento solto", () => {
  // O texto vem do painel do parceiro, então é editável por ele. O que não pode acontecer é a
  // troca de um acento derrubar a amostragem inteira da vaga.
  assertEquals(parseMinimumStayDays("Periodo minimo de permanencia:  2 dias"), 2);
  assertEquals(parseMinimumStayDays("Período mínimo de permanência: 10 dia(s)"), 10);
});

Deno.test("parseMinimumStayDays devolve null no que não é recusa por estadia", () => {
  assertEquals(parseMinimumStayDays('{"errors":{"message":"Produto indisponível"}}'), null);
  assertEquals(parseMinimumStayDays("<html>500</html>"), null);
  // Zero não é piso: seria um "mínimo" que não restringe nada e viraria laço infinito.
  assertEquals(parseMinimumStayDays("Período mínimo de permanência: 0 dia(s)"), null);
});

// ── rede: teto de tempo, redirecionamento e status do erro (08/10/2026) ──────────────────────

function withFetch(fake: typeof fetch, fn: () => Promise<void>) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  return fn().finally(() => {
    globalThis.fetch = real;
  });
}

const cfg = { wl_domain: "parceiro-app.movepark.co", wl_tenant_key: "parceiro", wl_sync_enabled: true };
const body = {
  external_id: "b1",
  operation: "reserve" as const,
  category_slug: "c",
  product_slug: "p",
  quantity: 1,
  start_date: "2027-04-30",
};

Deno.test("wlPostSync não segue redirecionamento e chama com teto de tempo", async () => {
  let init: RequestInit | undefined;
  await withFetch(
    ((_url: string, i?: RequestInit) => {
      init = i;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch,
    async () => {
      await wlPostSync(cfg, "token", body);
    },
  );
  assertEquals(init?.redirect, "manual");
  assertEquals(init?.signal instanceof AbortSignal, true);
});

Deno.test("wlPostSync com erro HTTP carrega o status para a fila", async () => {
  await withFetch(
    (() => Promise.resolve(new Response('{"error":"cheio"}', { status: 422 }))) as typeof fetch,
    async () => {
      const e = await assertRejects(() => wlPostSync(cfg, "token", body), WlHttpError);
      assertEquals(wlErrorStatus(e), 422);
    },
  );
});

Deno.test("redirecionamento vira erro, e falha de rede não tem status", async () => {
  await withFetch(
    (() => Promise.resolve(new Response(null, { status: 302, headers: { Location: "https://x" } }))) as typeof fetch,
    async () => {
      const e = await assertRejects(() => wlPostSync(cfg, "token", body), WlHttpError);
      assertEquals(wlErrorStatus(e), 302);
    },
  );
  assertEquals(wlErrorStatus(new TypeError("network")), null);
});

// ── lista de pedidos (reservas do site no Hub) ───────────────────────────────────────────────

Deno.test("buildOrdersUrl monta o cursor na query", () => {
  assertEquals(
    buildOrdersUrl("https://parceiro-app.movepark.co/", { updated_since: "2026-10-01 12:00:00", after_id: 7 }, 200),
    "https://parceiro-app.movepark.co/api/v3/backend/orders?updated_since=2026-10-01+12%3A00%3A00&after_id=7&limit=200",
  );
});

Deno.test("parseOrdersPage lê data e o próximo cursor", () => {
  const page = parseOrdersPage(
    { data: [{ id: 1 }], meta: { next_cursor: { updated_since: "2026-10-02 08:00:00", after_id: 1 }, has_more: true } },
    { updated_since: "1970-01-01 00:00:00", after_id: 0 },
  );
  assertEquals(page.rows.length, 1);
  assertEquals(page.nextCursor, { updated_since: "2026-10-02 08:00:00", after_id: 1 });
  assertEquals(page.hasMore, true);
});

Deno.test("parseOrdersPage recusa resposta sem data[] em vez de fingir página vazia", async () => {
  await assertRejects(async () => {
    parseOrdersPage({ message: "erro" }, { updated_since: "x", after_id: 0 });
  });
});

Deno.test("wlListOrders: 404 (rota ainda não publicada) vira erro com status", async () => {
  await withFetch(
    (() => Promise.resolve(new Response("not found", { status: 404 }))) as typeof fetch,
    async () => {
      const e = await assertRejects(
        () => wlListOrders(cfg, "token", { updated_since: "1970-01-01 00:00:00", after_id: 0 }, 200),
        WlHttpError,
      );
      assertEquals(wlErrorStatus(e), 404);
    },
  );
});

// ── ações sobre o pedido (fase 4) ────────────────────────────────────────────────────────────

Deno.test("wlMarkAttendance: 409 do legado vira recusa com o código, não exceção", async () => {
  await withFetch(
    (() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: "Só pedido pago", data: { code: "not_eligible" } }), { status: 409 }),
      )) as typeof fetch,
    async () => {
      const r = await wlMarkAttendance(cfg, "token", { orderNumber: "A-1", status: "no_show" });
      assertEquals(r, { kind: "refused", status: 409, code: "not_eligible", message: "Só pedido pago" });
    },
  );
});

Deno.test("wlChangeLicensePlate: manda o corpo do contrato e lê data", async () => {
  let sent: Record<string, unknown> = {};
  await withFetch(
    ((_u: string, i?: RequestInit) => {
      sent = JSON.parse(String(i?.body));
      return Promise.resolve(
        new Response(JSON.stringify({ data: { license_plate: "XYZ9K88", changed: true } }), { status: 200 }),
      );
    }) as typeof fetch,
    async () => {
      const r = await wlChangeLicensePlate(cfg, "token", {
        orderNumber: "A-1",
        licensePlate: "xyz-9k88",
        reason: "carro da esposa",
        actor: "Ana",
      });
      assertEquals(r.kind, "ok");
    },
  );
  assertEquals(sent, {
    order_number: "A-1",
    license_plate: "xyz-9k88",
    reason: "carro da esposa",
    brand: null,
    model: null,
    color: null,
    actor: "Ana",
  });
});

Deno.test("wlMarkAttendance: 5xx do legado é exceção com status", async () => {
  await withFetch(
    (() => Promise.resolve(new Response("{}", { status: 502 }))) as typeof fetch,
    async () => {
      const e = await assertRejects(
        () => wlMarkAttendance(cfg, "token", { orderNumber: "A-1", status: "compareceu" }),
        WlHttpError,
      );
      assertEquals(wlErrorStatus(e), 502);
    },
  );
});
