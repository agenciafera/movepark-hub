import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCloudparkReservation,
  cloudpark,
  cloudparkLocalDateTime,
  interpretCloudparkResponse,
  parseCloudparkConfig,
  parseCloudparkPlans,
} from "./cloudpark.ts";
import type { ReserveInput } from "./types.ts";

const input: ReserveInput = {
  bookingCode: "MP-A67A17",
  checkInAt: "2026-10-31T10:00:00Z", // 07:00 em São Paulo
  checkOutAt: "2026-11-02T13:00:00Z", // 10:00 em São Paulo
  plate: "bbr-4h93",
  firstName: "Ana",
  lastName: "Souza",
  email: "ana@example.com",
  phone: "41999990000",
  taxId: "12345678900",
  totalAmount: 65.7,
  passengerCount: 2,
  hasPcd: false,
  vehicleModel: "Onix",
  vehicleColor: "Prata",
  parkingTypeId: "pt-premium",
  parkingTypeName: "Vaga Premium",
};

const cfg = parseCloudparkConfig({
  base_url: "https://1269.cloudpark.com.br",
  whitelabel: "Nation Park",
  category: "Aeroporto Afonso Pena",
  product_names: { "pt-premium": "Vaga MAX" },
});

Deno.test("cloudparkLocalDateTime: converte para São Paulo e aplica a folga", () => {
  assertEquals(cloudparkLocalDateTime("2026-10-31T10:00:00Z", 0), "2026-10-31 07:00:00");
  assertEquals(cloudparkLocalDateTime("2026-10-31T10:00:00Z", -60), "2026-10-31 06:00:00");
  // 02:30 UTC = 23:30 do dia anterior em São Paulo; com 1 hora de folga vira meia-noite e meia
  assertEquals(cloudparkLocalDateTime("2026-11-01T02:30:00Z", 60), "2026-11-01 00:30:00");
});

Deno.test("buildCloudparkReservation: mesmo corpo que o n8n mandava, com a folga de 1 hora", () => {
  const body = buildCloudparkReservation(input, cfg);
  assertEquals(body.initial_date, "2026-10-31 06:00:00");
  assertEquals(body.final_date, "2026-11-02 11:00:00");
  assertEquals(body.original_initial_date, "2026-10-31 07:00:00");
  assertEquals(body.original_final_date, "2026-11-02 10:00:00");
  assertEquals(body.license_plate, "BBR4H93");
  assertEquals(body.name, "Ana");
  assertEquals(body.last_name, "Souza");
  assertEquals(body.email, "ana@example.com");
  assertEquals(body.total_price_value, 65.7);
  assertEquals(body.whitelabel, "Nation Park");
  assertEquals(body.category, "Aeroporto Afonso Pena");
  assertEquals(body.product, "Vaga MAX");
  assertEquals(body.booking_code, "MP-A67A17");
  assertEquals((body.vehicle as Record<string, unknown>).license_plate, "BBR4H93");
  assert(!("plan_id" in body), "sem plano configurado, não manda plan_id (como o n8n)");
});

Deno.test("buildCloudparkReservation: plano, folga própria e nome do tipo de vaga sem mapa", () => {
  const c = parseCloudparkConfig({
    base_url: "https://1269.cloudpark.com.br",
    plan_id: 77,
    entry_margin_min: 30,
    exit_margin_min: 0,
  });
  const body = buildCloudparkReservation({ ...input, parkingTypeId: "pt-coberta", parkingTypeName: "Vaga Coberta" }, c);
  assertEquals(body.plan_id, 77);
  assertEquals(body.initial_date, "2026-10-31 06:30:00");
  assertEquals(body.final_date, "2026-11-02 10:00:00");
  assertEquals(body.product, "Vaga Coberta");
  assert(!("whitelabel" in body));
});

Deno.test("parseCloudparkConfig: só aceita o link de nuvem da Cloudpark", () => {
  for (const base_url of ["http://192.168.0.10", "https://evil.example.com", "https://cloudpark.com.br.evil.io", ""]) {
    let threw = false;
    try {
      parseCloudparkConfig({ base_url });
    } catch {
      threw = true;
    }
    assert(threw, `deveria recusar ${base_url}`);
  }
  assertEquals(parseCloudparkConfig({ base_url: "https://Sandbox.Cloudpark.com.br/" }).base_url, "https://sandbox.cloudpark.com.br");
});

Deno.test("interpretCloudparkResponse: código, recusa, token e falha passageira", () => {
  assertEquals(interpretCloudparkResponse(200, { message: " 5d864b66-ff5f-4f98-ad6f-323c7 " }), {
    ok: true,
    code: "5d864b66-ff5f-4f98-ad6f-323c7",
  });
  // 13/08/2026: a Cloudpark respondeu 200 sem código. Não dá para pôr QR vazio no voucher.
  assertEquals(interpretCloudparkResponse(200, { message: "" }).ok, false);
  assertEquals(interpretCloudparkResponse(200, { message: "" }), {
    ok: false,
    kind: "transient",
    error: "A Cloudpark respondeu sem código de acesso.",
  });
  assertEquals(interpretCloudparkResponse(401, { detail: "Token inválido." }), {
    ok: false,
    kind: "auth",
    error: "Token inválido.",
  });
  assertEquals(interpretCloudparkResponse(400, { message: "Placa inválida" }), {
    ok: false,
    kind: "rejected",
    error: "Placa inválida",
  });
  assertEquals(interpretCloudparkResponse(503, "Service Unavailable").ok, false);
  assertEquals((interpretCloudparkResponse(503, "x") as { kind: string }).kind, "transient");
  assertEquals((interpretCloudparkResponse(429, {}) as { kind: string }).kind, "transient");
});

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) {
  return (url: string | URL | Request, init?: RequestInit) => {
    seen.url = String(url);
    seen.init = init;
    return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  };
}

Deno.test("cloudpark.reserve: chama o reserveparking com o token e devolve o código", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const out = await cloudpark.reserve(cfg, "abc123token", input, {
    fetchImpl: fakeFetch(200, { message: "fd1c1e73-5dfe-4dea-ab43-1d4ce" }, seen) as typeof fetch,
  });
  assertEquals(seen.url, "https://1269.cloudpark.com.br/api/v1/integration/reserveparking");
  assertEquals((seen.init?.headers as Record<string, string>).Authorization, "Token abc123token");
  assertEquals(seen.init?.method, "POST");
  assert(out.ok);
  if (out.ok) assertEquals(out.code, "fd1c1e73-5dfe-4dea-ab43-1d4ce");
  assertEquals(out.httpStatus, 200);
});

Deno.test("cloudpark.reserve: erro de rede vira falha passageira, sem lançar", async () => {
  const out = await cloudpark.reserve(cfg, "t0k3n-abc", input, {
    fetchImpl: (() => Promise.reject(new TypeError("connection reset"))) as typeof fetch,
  });
  assertEquals(out.ok, false);
  if (!out.ok) {
    assertEquals(out.kind, "transient");
    assertEquals(out.httpStatus, null);
  }
});

Deno.test("cloudpark.reserve: tempo esgotado vira falha passageira", async () => {
  const slow = ((_u: string, init?: RequestInit) =>
    new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    })) as unknown as typeof fetch;
  const out = await cloudpark.reserve(cfg, "t0k3n-abc", input, { fetchImpl: slow, timeoutMs: 20 });
  assertEquals(out.ok, false);
  if (!out.ok) assertEquals(out.kind, "transient");
});

// 30/10/2026, instância 1269: o Swagger promete uma lista, mas a produção devolve uma página do
// Django REST ({count, next, previous, results}) com o id do plano em texto.
Deno.test("parseCloudparkPlans: aceita a página real e a lista do Swagger, e descarta plano apagado", () => {
  const pagina = {
    count: 3,
    next: null,
    previous: null,
    results: [
      { id: "414533839", name: "Diaria 13.00", kind: "0", deleted: false },
      { id: "414533840", name: "Antigo", kind: "0", deleted: true },
      { id: 77, name: "Reserva online" },
    ],
  };
  assertEquals(parseCloudparkPlans(pagina), [
    { id: 414533839, name: "Diaria 13.00" },
    { id: 77, name: "Reserva online" },
  ]);
  assertEquals(parseCloudparkPlans([{ id: 1, name: "A" }]), [{ id: 1, name: "A" }]);
  assertEquals(parseCloudparkPlans({ detail: "x" }), null);
  assertEquals(parseCloudparkPlans("<html>"), null);
});

Deno.test("cloudpark.testConnection: com a página real, conecta e conta os planos", async () => {
  const out = await cloudpark.testConnection(cfg, "abc123token", {
    fetchImpl: fakeFetch(200, { count: 1, next: null, previous: null, results: [{ id: "9", name: "Diaria" }] }) as typeof fetch,
  });
  assertEquals(out.ok, true);
  assertEquals(out.detail, "Conectado. 1 plano encontrado.");
  assertEquals(out.plans, [{ id: 9, name: "Diaria" }]);
});

Deno.test("cloudpark.testConnection: lista os planos com o token", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const out = await cloudpark.testConnection(cfg, "abc123token", {
    fetchImpl: fakeFetch(200, [{ id: 1, name: "Reserva online", kind: "0" }, { id: 2, name: "Mensalista" }], seen) as typeof fetch,
  });
  assertEquals(seen.url, "https://1269.cloudpark.com.br/api/v1/integration/customerplan");
  assertEquals(seen.init?.method ?? "GET", "GET");
  assertEquals(out.ok, true);
  assertEquals(out.plans, [{ id: 1, name: "Reserva online" }, { id: 2, name: "Mensalista" }]);
});

Deno.test("cloudpark.testConnection: token recusado", async () => {
  const out = await cloudpark.testConnection(cfg, "ruim-token", {
    fetchImpl: fakeFetch(401, { detail: "Token inválido." }) as typeof fetch,
  });
  assertEquals(out.ok, false);
  assertEquals(out.kind, "auth");
});

Deno.test("cloudpark.reserve: configuração inválida não chega a chamar a rede", async () => {
  await assertRejects(() =>
    cloudpark.reserve({ base_url: "https://evil.example.com" } as never, "abc", input, {
      fetchImpl: fakeFetch(200, { message: "x" }) as typeof fetch,
    })
  );
});
