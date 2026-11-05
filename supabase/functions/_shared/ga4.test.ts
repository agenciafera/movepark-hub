import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPurchasePayload,
  ga4ConfigFromEnv,
  paidPayment,
  type PurchaseBookingRow,
  purchaseItems,
  redactSecret,
  sendPurchase,
  TIMESTAMP_WINDOW_MS,
  tituloDaUnidade,
} from "./ga4.ts";

const NOW = new Date("2026-11-05T15:00:00Z");

function row(over: Partial<PurchaseBookingRow> = {}): PurchaseBookingRow {
  return {
    id: "bk-1",
    code: "MP-19DFA0",
    status: "confirmed",
    total_amount: "170.40",
    currency: "BRL",
    fare_tier: "flex",
    profile_id: "user-1",
    ga_client_id: "1234567890.1699999999",
    ga_session_id: "1762300000",
    price_breakdown: {
      days: 2,
      coupon: { code: "FERA10" },
      fare: { tier: "flex", label: "Flex", amount: 12.9 },
    },
    location: {
      slug: "guarulhos",
      name: "Estacionamento Guarulhos",
      public_name: "Aerovalet - Estacionamento Guarulhos",
      company: { slug: "aerovalet", name: "Aerovalet" },
      destination: { code: "GRU", name: "Guarulhos" },
    },
    items: [
      { id: "it-1", item_type: "parking", quantity: 1, unit_price: "75.70", subtotal: "151.40", add_on_service_id: null, parking_type: { code: "covered", name: "Vaga coberta" }, add_on_service: null },
      { id: "it-2", item_type: "add_on", quantity: 2, unit_price: "17.07", subtotal: "34.14", add_on_service_id: "svc-1", parking_type: null, add_on_service: { name: "Lavagem simples" } },
    ],
    payments: [
      { status: "failed", kind: "booking", method: "card", paid_at: null, created_at: "2026-11-05T14:00:00Z" },
      { status: "paid", kind: "booking", method: "pix", paid_at: "2026-11-05T14:30:00Z", created_at: "2026-11-05T14:20:00Z" },
    ],
    ...over,
  };
}

Deno.test("ga4ConfigFromEnv: só com os dois segredos, e uma propriedade por par", () => {
  assertEquals(ga4ConfigFromEnv(() => undefined), null);
  assertEquals(ga4ConfigFromEnv((k) => (k === "GA4_MEASUREMENT_ID" ? "G-1" : undefined)), null);
  assertEquals(ga4ConfigFromEnv((k) => (k === "GA4_MEASUREMENT_ID" ? " G-1 " : "s3cr3t")), [{ measurementId: "G-1", apiSecret: "s3cr3t" }]);
  assertEquals(
    ga4ConfigFromEnv((k) => (k === "GA4_MEASUREMENT_ID" ? "G-1, G-2" : "s1,s2")),
    [{ measurementId: "G-1", apiSecret: "s1" }, { measurementId: "G-2", apiSecret: "s2" }],
  );
  // Lista desparelhada é erro de configuração: melhor não mandar nada do que mandar com o segredo errado.
  assertEquals(ga4ConfigFromEnv((k) => (k === "GA4_MEASUREMENT_ID" ? "G-1,G-2" : "s1")), null);
});

Deno.test("tituloDaUnidade espelha o front: nome público, dedupe da marca, separador", () => {
  assertEquals(tituloDaUnidade("Aerovalet - Estacionamento Guarulhos", "Aerovalet", "GRU"), "Aerovalet - Estacionamento Guarulhos");
  assertEquals(tituloDaUnidade(null, "Virapark", "Virapark"), "Virapark");
  assertEquals(tituloDaUnidade(null, "Peu Park", "Peu Park Zumbi dos Palmares"), "Peu Park Zumbi dos Palmares");
  assertEquals(tituloDaUnidade(null, "Aerovalet", "Aeroporto de Congonhas"), "Aerovalet · Aeroporto de Congonhas");
  assertEquals(tituloDaUnidade(null, null, "Só a unidade"), "Só a unidade");
});

Deno.test("purchaseItems: vaga, adicional e tarifa paga, no schema do front", () => {
  const items = purchaseItems(row());
  assertEquals(items.map((i) => i.item_id), ["aerovalet/guarulhos:covered", "adicional:svc-1", "tarifa:flex"]);
  assertEquals(items[0], {
    item_id: "aerovalet/guarulhos:covered",
    item_name: "Aerovalet - Estacionamento Guarulhos",
    affiliation: "Movepark",
    item_brand: "Aerovalet",
    item_category: "GRU",
    item_category2: "estacionamento",
    item_variant: "Vaga coberta",
    price: 151.4,
    quantity: 1,
    stay_days: 2,
    fare_tier: "flex",
  });
  assertEquals(items[1].item_category2, "adicional");
  assertEquals(items[1].price, 17.07);
  assertEquals(items[1].quantity, 2);
  assertEquals(items[2], {
    item_id: "tarifa:flex",
    item_name: "Tarifa Flex",
    affiliation: "Movepark",
    item_brand: "Aerovalet",
    item_category: "GRU",
    item_category2: "tarifa",
    price: 12.9,
    quantity: 1,
    fare_tier: "flex",
  });
});

Deno.test("purchaseItems: a Básica (grátis) não vira item; sem destino a categoria fica vazia", () => {
  const items = purchaseItems(row({ fare_tier: "basica", price_breakdown: { days: 1, fare: null, coupon: null }, location: { ...row().location, destination: null } }));
  assertEquals(items.length, 2);
  assertEquals(items[0].item_category, "");
  // A tarifa escolhida fica no item da vaga mesmo quando é a Básica (igual ao front); só o item próprio some.
  assertEquals(items[0].fare_tier, "basica");
  assertEquals(items.some((i) => i.item_category2 === "tarifa"), false);
});

Deno.test("paidPayment: o aprovado mais recente da cobrança da reserva, nunca o de adicional", () => {
  const p = paidPayment([
    { status: "paid", kind: "add_on", method: "pix", paid_at: "2026-11-05T14:50:00Z", created_at: "2026-11-05T14:50:00Z" },
    ...row().payments,
  ]);
  assertEquals(p?.method, "pix");
  assertEquals(p?.paid_at, "2026-11-05T14:30:00Z");
  assertEquals(paidPayment([]), null);
});

Deno.test("buildPurchasePayload: transaction_id, value, currency, itens e sessão do navegador", () => {
  const body = buildPurchasePayload(row(), { newCustomer: true, now: NOW });
  assertEquals(body.client_id, "1234567890.1699999999");
  assertEquals(body.user_id, "user-1");
  assertEquals(body.non_personalized_ads, false);
  assertEquals(body.timestamp_micros, Date.parse("2026-11-05T14:30:00Z") * 1000);
  const ev = body.events[0];
  assertEquals(ev.name, "purchase");
  assertEquals(ev.params.transaction_id, "MP-19DFA0");
  assertEquals(ev.params.value, 170.4);
  assertEquals(ev.params.currency, "BRL");
  assertEquals(ev.params.coupon, "FERA10");
  assertEquals(ev.params.payment_type, "pix");
  assertEquals(ev.params.session_id, "1762300000");
  assertEquals(ev.params.new_customer, true);
  assertEquals(ev.params.tax, 0);
  assertEquals(ev.params.shipping, 0);
  assertEquals(ev.params.items.length, 3);
  // A soma dos itens bate com o total menos o cupom (151,40 + 34,14 + 12,90 = 198,44; cupom 28,04).
  const soma = ev.params.items.reduce((s, i) => s + i.price * i.quantity, 0);
  assertEquals(Math.round(soma * 100) / 100, 198.44);
});

Deno.test("buildPurchasePayload: sem cookie cai no user_id; sem usuário, no id da reserva", () => {
  const semCookie = buildPurchasePayload(row({ ga_client_id: null, ga_session_id: null }), { now: NOW });
  assertEquals(semCookie.client_id, "user-1");
  assertEquals("session_id" in semCookie.events[0].params, false);
  const anonimo = buildPurchasePayload(row({ ga_client_id: null, profile_id: null }), { now: NOW });
  assertEquals(anonimo.client_id, "bk-1");
  assertEquals("user_id" in anonimo, false);
  assertEquals("new_customer" in anonimo.events[0].params, false);
});

Deno.test("buildPurchasePayload: pagamento com mais de 72h vai sem timestamp_micros", () => {
  const velho = new Date(NOW.getTime() + TIMESTAMP_WINDOW_MS + 1);
  const body = buildPurchasePayload(row(), { now: velho });
  assertEquals("timestamp_micros" in body, false);
  const semData = buildPurchasePayload(row({ payments: [] }), { now: NOW });
  assertEquals("timestamp_micros" in semData, false);
  assertEquals("payment_type" in semData.events[0].params, false);
});

// Admin de mentira: grava cada escrita em `booking` e responde o que o cenário manda.
type Cenario = { claim: boolean; row: PurchaseBookingRow | null; count?: number | null; throwOnSelect?: boolean };
function fakeAdmin(c: Cenario) {
  const writes: Record<string, unknown>[] = [];
  // deno-lint-ignore no-explicit-any
  const builder = (op: "update" | "select", payload: any): any => {
    const b = {
      op,
      head: op === "select" && payload?.opts?.head === true,
      eq() { return b; },
      is() { return b; },
      in() { return b; },
      neq() { return b; },
      select(_cols: string, opts?: { head?: boolean }) { if (opts?.head) b.head = true; return b; },
      maybeSingle() {
        if (b.op === "update") return Promise.resolve({ data: c.claim ? { id: "bk-1" } : null });
        if (c.throwOnSelect) return Promise.reject(new Error("banco fora"));
        return Promise.resolve({ data: c.row });
      },
      then(resolve: (v: unknown) => void) { resolve({ data: null, count: c.count ?? 0 }); },
    };
    return b;
  };
  return {
    writes,
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) { writes.push({ table, ...patch }); return builder("update", patch); },
        select(cols: string, opts?: { head?: boolean }) { return builder("select", { cols, opts }); },
      };
    },
  };
}

const CFG = [{ measurementId: "G-TEST", apiSecret: "s3cr3t" }];

function fakeFetch(status: number | ((url: string) => number) = 204) {
  const calls: { url: string; body: unknown }[] = [];
  const fn = ((url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return Promise.resolve(new Response(null, { status: typeof status === "function" ? status(url) : status }));
  }) as unknown as typeof fetch;
  return { fn, calls };
}

Deno.test("sendPurchase: POST ao Measurement Protocol com os segredos na query e o purchase no corpo", async () => {
  const admin = fakeAdmin({ claim: true, row: row(), count: 0 });
  const f = fakeFetch();
  const r = await sendPurchase(admin, "bk-1", { config: CFG, fetch: f.fn, now: NOW });
  assertEquals(r.outcome, "sent");
  assertEquals(f.calls.length, 1);
  assert(f.calls[0].url.startsWith("https://www.google-analytics.com/mp/collect?measurement_id=G-TEST&api_secret=s3cr3t"));
  // deno-lint-ignore no-explicit-any
  const body = f.calls[0].body as any;
  assertEquals(body.events[0].name, "purchase");
  assertEquals(body.events[0].params.transaction_id, "MP-19DFA0");
  assertEquals(body.events[0].params.new_customer, true);
  // A guarda ficou marcada (uma escrita, com a hora) e não foi liberada.
  assertEquals(admin.writes.length, 1);
  assertEquals(admin.writes[0].ga_purchase_sent_at, NOW.toISOString());
});

Deno.test("sendPurchase: com histórico pago, new_customer é false", async () => {
  const admin = fakeAdmin({ claim: true, row: row(), count: 2 });
  const f = fakeFetch();
  await sendPurchase(admin, "bk-1", { config: CFG, fetch: f.fn, now: NOW });
  // deno-lint-ignore no-explicit-any
  assertEquals((f.calls[0].body as any).events[0].params.new_customer, false);
});

Deno.test("sendPurchase: duas propriedades recebem o mesmo corpo; uma recusa libera a guarda", async () => {
  const cfg = [{ measurementId: "G-A", apiSecret: "sa" }, { measurementId: "G-B", apiSecret: "sb" }];
  const ok = fakeFetch();
  const r1 = await sendPurchase(fakeAdmin({ claim: true, row: row() }), "bk-1", { config: cfg, fetch: ok.fn, now: NOW });
  assertEquals(r1.outcome, "sent");
  assertEquals(ok.calls.map((c) => new URL(c.url).searchParams.get("measurement_id")), ["G-A", "G-B"]);
  assertEquals(ok.calls.map((c) => new URL(c.url).searchParams.get("api_secret")), ["sa", "sb"]);
  assertEquals(JSON.stringify(ok.calls[0].body), JSON.stringify(ok.calls[1].body));

  const admin = fakeAdmin({ claim: true, row: row() });
  const meio = fakeFetch((url) => (url.includes("G-B") ? 500 : 204));
  const r2 = await sendPurchase(admin, "bk-1", { config: cfg, fetch: meio.fn, now: NOW });
  assertEquals(r2, { outcome: "failed", error: "G-B: HTTP 500" });
  assertEquals(admin.writes.map((w) => w.ga_purchase_sent_at), [NOW.toISOString(), null]);
});

Deno.test("sendPurchase: sem segredos não escreve nem chama a rede", async () => {
  const admin = fakeAdmin({ claim: true, row: row() });
  const f = fakeFetch();
  const r = await sendPurchase(admin, "bk-1", { config: null, fetch: f.fn });
  assertEquals(r, { outcome: "skipped", reason: "unconfigured" });
  assertEquals(f.calls.length, 0);
  assertEquals(admin.writes.length, 0);
});

Deno.test("sendPurchase: reentrega do webhook (guarda já marcada) não manda de novo", async () => {
  const admin = fakeAdmin({ claim: false, row: row() });
  const f = fakeFetch();
  const r = await sendPurchase(admin, "bk-1", { config: CFG, fetch: f.fn });
  assertEquals(r, { outcome: "skipped", reason: "already_sent" });
  assertEquals(f.calls.length, 0);
});

Deno.test("sendPurchase: GA4 recusou → libera a guarda para a próxima tentativa, sem lançar", async () => {
  const admin = fakeAdmin({ claim: true, row: row() });
  const f = fakeFetch(502);
  const r = await sendPurchase(admin, "bk-1", { config: CFG, fetch: f.fn, now: NOW });
  assertEquals(r, { outcome: "failed", error: "G-TEST: HTTP 502" });
  assertEquals(admin.writes.map((w) => w.ga_purchase_sent_at), [NOW.toISOString(), null]);
});

Deno.test("sendPurchase: rede fora do ar é engolida e a guarda volta a nulo", async () => {
  const admin = fakeAdmin({ claim: true, row: row() });
  const f = (() => Promise.reject(new Error("ECONNRESET"))) as unknown as typeof fetch;
  const r = await sendPurchase(admin, "bk-1", { config: CFG, fetch: f, now: NOW });
  assertEquals(r.outcome, "failed");
  assertEquals(admin.writes.map((w) => w.ga_purchase_sent_at), [NOW.toISOString(), null]);
});

Deno.test("sendPurchase: erro de rede com a URL na mensagem não vaza o api_secret", async () => {
  const admin = fakeAdmin({ claim: true, row: row() });
  const logs: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  try {
    const f = ((url: string) => Promise.reject(new TypeError(`error sending request for url (${url}): dns error`))) as unknown as typeof fetch;
    const r = await sendPurchase(admin, "bk-1", { config: CFG, fetch: f, now: NOW });
    assertEquals(r.outcome, "failed");
    const texto = JSON.stringify(r) + logs.join("\n");
    assertEquals(texto.includes("s3cr3t"), false);
    assert(texto.includes("api_secret=***"));
  } finally {
    console.error = orig;
  }
});

Deno.test("redactSecret: só o segredo sai, o resto da mensagem fica", () => {
  assertEquals(redactSecret("url (https://x/mp/collect?measurement_id=G-1&api_secret=abc): boom"), "url (https://x/mp/collect?measurement_id=G-1&api_secret=***): boom");
  assertEquals(redactSecret("sem segredo"), "sem segredo");
});

Deno.test("sendPurchase: banco fora depois da guarda também libera e não lança", async () => {
  const admin = fakeAdmin({ claim: true, row: null, throwOnSelect: true });
  const r = await sendPurchase(admin, "bk-1", { config: CFG, fetch: fakeFetch().fn, now: NOW });
  assertEquals(r.outcome, "failed");
  assertEquals(admin.writes.map((w) => w.ga_purchase_sent_at), [NOW.toISOString(), null]);
});

Deno.test("sendPurchase: reserva sumiu → skipped e guarda liberada", async () => {
  const admin = fakeAdmin({ claim: true, row: null });
  const r = await sendPurchase(admin, "bk-1", { config: CFG, fetch: fakeFetch().fn, now: NOW });
  assertEquals(r, { outcome: "skipped", reason: "not_found" });
  assertEquals(admin.writes.map((w) => w.ga_purchase_sent_at), [NOW.toISOString(), null]);
});
