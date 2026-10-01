import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildQuoteBookingArgs,
  erroDeSessao,
  normalizeAssertedPhone,
  temSessao,
  buildCreateBookingBody,
  CUSTOMER_AUTH_TOOLS,
  CUSTOMER_TXN_NAMES,
  CUSTOMER_TXN_TOOLS,
  isOtpChannel,
  otpRequestParams,
  otpVerifyParams,
} from "./customer.logic.ts";

Deno.test("isOtpChannel: só whatsapp e email", () => {
  assertEquals(isOtpChannel("whatsapp"), true);
  assertEquals(isOtpChannel("email"), true);
  assertEquals(isOtpChannel("sms"), false);
  assertEquals(isOtpChannel(""), false);
  assertEquals(isOtpChannel(undefined), false);
});

Deno.test("otpRequestParams: whatsapp manda phone + channel whatsapp", () => {
  assertEquals(otpRequestParams("whatsapp", "+5511987654321"), {
    phone: "+5511987654321",
    options: { shouldCreateUser: true, channel: "whatsapp" },
  });
});

Deno.test("otpRequestParams: email manda email", () => {
  assertEquals(otpRequestParams("email", "a@b.com"), {
    email: "a@b.com",
    options: { shouldCreateUser: true },
  });
});

Deno.test("otpRequestParams: trima o identificador", () => {
  const p = otpRequestParams("email", "  a@b.com  ") as { email: string };
  assertEquals(p.email, "a@b.com");
});

Deno.test("otpRequestParams: canal inválido e identificador vazio lançam", () => {
  assertThrows(() => otpRequestParams("sms", "x"), Error, "Canal inválido");
  assertThrows(() => otpRequestParams("email", "   "), Error, "obrigatório");
});

Deno.test("otpVerifyParams: whatsapp verifica com type sms", () => {
  assertEquals(otpVerifyParams("whatsapp", "+5511987654321", "123456"), {
    phone: "+5511987654321",
    token: "123456",
    type: "sms",
  });
});

Deno.test("otpVerifyParams: email verifica com type email", () => {
  assertEquals(otpVerifyParams("email", "a@b.com", "123456"), {
    email: "a@b.com",
    token: "123456",
    type: "email",
  });
});

Deno.test("otpVerifyParams: código ausente lança", () => {
  assertThrows(() => otpVerifyParams("email", "a@b.com", ""), Error, "Código");
});

Deno.test("CUSTOMER_AUTH_TOOLS: nomes esperados e schema fechado", () => {
  assertEquals(CUSTOMER_AUTH_TOOLS.map((t) => t.name).sort(), [
    "assert_verified_identity",
    "request_login_otp",
    "verify_login_otp",
    "whoami",
  ]);
  for (const t of CUSTOMER_AUTH_TOOLS) {
    assertEquals(t.inputSchema.additionalProperties, false, t.name);
  }
});

// Cria sessão sem OTP: só com a chave do bot da Movepark. Sem escopo, qualquer agente do MCP
// público afirmaria o telefone de outra pessoa e receberia a sessão dela (agent-booking.md §2.1).
Deno.test("no login, só assert_verified_identity exige escopo, e é identity:assert", () => {
  assertEquals(
    CUSTOMER_AUTH_TOOLS.filter((t) => t.scope).map((t) => [t.name, t.scope]),
    [["assert_verified_identity", "identity:assert"]],
  );
});

Deno.test("normalizeAssertedPhone: aceita E.164 com e sem +, devolve só dígitos", () => {
  assertEquals(normalizeAssertedPhone("5541988149449"), "5541988149449");
  assertEquals(normalizeAssertedPhone("+5541988149449"), "5541988149449");
  assertEquals(normalizeAssertedPhone(" +55 (41) 98814-9449 "), "5541988149449");
  // fora do Brasil: E.164 genérico
  assertEquals(normalizeAssertedPhone("+351912345678"), "351912345678");
});

// Sem o nono dígito o GoTrue veria outro telefone e criaria conta duplicada para a mesma pessoa.
Deno.test("normalizeAssertedPhone: Brasil exige DDD e nono dígito", () => {
  assertThrows(() => normalizeAssertedPhone("554188149449"), Error, "nono dígito");
  assertThrows(() => normalizeAssertedPhone("5541388149449"), Error, "nono dígito");
  assertThrows(() => normalizeAssertedPhone("5501988149449"), Error, "nono dígito");
  assertThrows(() => normalizeAssertedPhone("55419881494490"), Error, "nono dígito");
});

Deno.test("normalizeAssertedPhone: lixo, vazio e e-mail lançam", () => {
  for (const v of ["", "abc", "a@b.com", null, undefined, 5541988149449, "+0123456789", "1234"]) {
    assertThrows(() => normalizeAssertedPhone(v), Error, "Telefone");
  }
});

Deno.test("CUSTOMER_TXN_TOOLS: nomes esperados e schema fechado", () => {
  assertEquals(CUSTOMER_TXN_TOOLS.map((t) => t.name).sort(), [
    "add_vehicle",
    "cancel_booking",
    "create_booking",
    "create_checkout_link",
    "get_booking",
    "get_booking_status",
    "list_my_bookings",
    "quote_booking",
    "set_booking_customer",
    "set_booking_vehicle",
  ]);
  for (const t of CUSTOMER_TXN_TOOLS) {
    assertEquals(t.inputSchema.additionalProperties, false, t.name);
  }
});

// Repasse do create_booking do consumidor: mapeia os args da tool pro corpo da Edge create-booking.
Deno.test("buildCreateBookingBody: repassa os campos e força origin mcp", () => {
  const body = buildCreateBookingBody({
    location_parking_type_id: "lpt-1",
    check_in_at: "2027-08-01T10:00:00Z",
    check_out_at: "2027-08-03T10:00:00Z",
    fare_tier: "flex",
    add_on_service_ids: ["a1"],
    coupon_code: "PROMO",
    passenger_count: 2,
    has_pcd: true,
  });
  assertEquals(body, {
    location_parking_type_id: "lpt-1",
    check_in_at: "2027-08-01T10:00:00Z",
    check_out_at: "2027-08-03T10:00:00Z",
    fare_tier: "flex",
    add_on_service_ids: ["a1"],
    coupon_code: "PROMO",
    passenger_count: 2,
    has_pcd: true,
    origin: "mcp",
  });
});

// Opcionais ausentes viram null/false; nunca inventamos idempotency_key no cliente (a dedup é
// derivada no servidor, em create_booking_atomic). Regressão do achado H1 / §16-1.
Deno.test("buildCreateBookingBody: defaults dos opcionais e sem idempotency_key", () => {
  const body = buildCreateBookingBody({
    location_parking_type_id: "lpt-1",
    check_in_at: "2027-08-01T10:00:00Z",
    check_out_at: "2027-08-03T10:00:00Z",
  });
  assertEquals(body.fare_tier, null);
  assertEquals(body.add_on_service_ids, null);
  assertEquals(body.coupon_code, null);
  assertEquals(body.passenger_count, null);
  assertEquals(body.has_pcd, false);
  assertEquals(body.origin, "mcp");
  assertEquals("idempotency_key" in body, false);
});

// Mitigação da session fixation: gerar link exige chamador confiável (chave mp_ com o escopo).
// As demais transacionais seguem sem escopo (o gate delas é o JWT + RLS do dono).
Deno.test("só create_checkout_link exige escopo entre as transacionais", () => {
  const comEscopo = CUSTOMER_TXN_TOOLS.filter((t) => t.scope).map((t) => t.name);
  assertEquals(comEscopo, ["create_checkout_link"]);
  assertEquals(
    CUSTOMER_TXN_TOOLS.find((t) => t.name === "create_checkout_link")!.scope,
    "checkout:link",
  );
});

Deno.test("CUSTOMER_TXN_NAMES cobre exatamente as transacionais", () => {
  assertEquals(CUSTOMER_TXN_NAMES.size, CUSTOMER_TXN_TOOLS.length);
  for (const t of CUSTOMER_TXN_TOOLS) assertEquals(CUSTOMER_TXN_NAMES.has(t.name), true, t.name);
  // login e leitura não são transacionais (não exigem JWT)
  for (const n of ["request_login_otp", "whoami", "search_parking"]) {
    assertEquals(CUSTOMER_TXN_NAMES.has(n), false, n);
  }
});

Deno.test("create_booking exige location/check-in/check-out; os opcionais não bloqueiam", () => {
  const t = CUSTOMER_TXN_TOOLS.find((x) => x.name === "create_booking")!;
  assertEquals(t.inputSchema.required, ["location_parking_type_id", "check_in_at", "check_out_at"]);
});

// A cotação e a reserva recebem os mesmos argumentos: o que muda o preço numa tem que chegar na outra.
Deno.test("buildQuoteBookingArgs: mesmos campos do create_booking, com defaults", () => {
  assertEquals(
    buildQuoteBookingArgs({
      location_parking_type_id: "lpt-1",
      check_in_at: "2027-08-01T10:00:00Z",
      check_out_at: "2027-08-03T10:00:00Z",
      fare_tier: "flex",
      add_on_service_ids: ["a1"],
      coupon_code: "PROMO",
      passenger_count: 2,
      has_pcd: true,
    }),
    {
      p_location_parking_type_id: "lpt-1",
      p_check_in_at: "2027-08-01T10:00:00Z",
      p_check_out_at: "2027-08-03T10:00:00Z",
      p_fare_tier: "flex",
      p_add_on_ids: ["a1"],
      p_coupon_code: "PROMO",
      p_passenger_count: 2,
      p_has_pcd: true,
    },
  );
  const d = buildQuoteBookingArgs({ location_parking_type_id: "x", check_in_at: "a", check_out_at: "b" });
  assertEquals([d.p_fare_tier, d.p_add_on_ids, d.p_coupon_code, d.p_has_pcd], ["basica", null, null, false]);
});

Deno.test("quote_booking e create_booking têm o mesmo schema de entrada", () => {
  const q = CUSTOMER_TXN_TOOLS.find((t) => t.name === "quote_booking")!;
  const c = CUSTOMER_TXN_TOOLS.find((t) => t.name === "create_booking")!;
  assertEquals(q.inputSchema, c.inputSchema);
  assertEquals(q.scope, undefined);
});

// Leitura do /customer usa a sessão quando ela vem (rascunho visível ao testador).
Deno.test("temSessao: só JWT de usuário conta como sessão", () => {
  assertEquals(temSessao("Bearer aaa.bbb.ccc"), true);
  assertEquals(temSessao("bearer aaa.bbb.ccc"), true);
  for (const v of [null, "", "Bearer ", "Bearer null", "Bearer mp_live_abc", "Basic x", "aaa.bbb.ccc"]) {
    assertEquals(temSessao(v), false, String(v));
  }
});

// JWT vencido não pode derrubar a descoberta: a leitura volta para o anônimo.
Deno.test("erroDeSessao: reconhece token ruim e não engole erro de consulta", () => {
  assertEquals(erroDeSessao(new Error("JWT expired")), true);
  assertEquals(erroDeSessao(new Error("invalid JWT: unable to parse or verify signature")), true);
  assertEquals(erroDeSessao({ message: "PGRST301" }), true);
  assertEquals(erroDeSessao(new Error("relation does not exist")), false);
  assertEquals(erroDeSessao(new Error("Destino não encontrado")), false);
});
