import { assertEquals } from "jsr:@std/assert";
import { matchRoute, normalizePath, pathExists } from "./router.ts";
import { extractApiKey, hasScope, keyPrefix, sha256Hex } from "./auth.ts";
import { pgErrorToHttp } from "./respond.ts";

Deno.test("normalizePath pega tudo a partir de /v1 (path do edge function)", () => {
  assertEquals(normalizePath("/functions/v1/api/v1/locations"), "/v1/locations");
  assertEquals(normalizePath("/v1/bookings/123/cancel"), "/v1/bookings/123/cancel");
});

Deno.test("matchRoute resolve handler, escopo e params", () => {
  assertEquals(matchRoute("GET", "/v1/locations"), { handler: "list_locations", scope: "locations:read", params: {} });
  assertEquals(matchRoute("GET", "/functions/v1/api/v1/locations/abc"), {
    handler: "get_location",
    scope: "locations:read",
    params: { id: "abc" },
  });
  assertEquals(matchRoute("GET", "/v1/locations/abc/parking-types")?.handler, "list_parking_types");
  assertEquals(matchRoute("POST", "/v1/bookings")?.scope, "bookings:write");
  assertEquals(matchRoute("POST", "/v1/bookings/xyz/cancel"), {
    handler: "cancel_booking",
    scope: "bookings:cancel",
    params: { id: "xyz" },
  });
  assertEquals(matchRoute("POST", "/v1/bookings/xyz/check-in")?.scope, "bookings:checkin");
  assertEquals(matchRoute("POST", "/v1/bookings/xyz/change-dates"), {
    handler: "change_dates",
    scope: "bookings:write",
    params: { id: "xyz" },
  });
  assertEquals(matchRoute("POST", "/v1/bookings/xyz/change-vehicle"), {
    handler: "change_vehicle",
    scope: "bookings:write",
    params: { id: "xyz" },
  });
});

Deno.test("matchRoute resolve as escritas de precificação (E1.4.1/2)", () => {
  assertEquals(matchRoute("POST", "/v1/parking-types/lpt1/pricing"), {
    handler: "set_pricing",
    scope: "pricing:write",
    params: { id: "lpt1" },
  });
  assertEquals(matchRoute("POST", "/v1/parking-types/lpt1/date-blocks"), {
    handler: "set_date_blocked",
    scope: "pricing:write",
    params: { id: "lpt1" },
  });
  // o /pricing não pode colidir com a edição base do tipo de vaga
  assertEquals(matchRoute("POST", "/v1/parking-types/lpt1")?.handler, "update_parking_type");
});

Deno.test("matchRoute retorna null para rota inexistente ou método errado", () => {
  assertEquals(matchRoute("GET", "/v1/unknown"), null);
  assertEquals(matchRoute("DELETE", "/v1/locations"), null);
});

Deno.test("pathExists distingue 404 de 405", () => {
  assertEquals(pathExists("/v1/locations"), true); // existe (mas só GET)
  assertEquals(pathExists("/v1/nope"), false);
});

Deno.test("matchRoute aceita barra final e decodifica params (%20)", () => {
  assertEquals(matchRoute("GET", "/v1/locations/")?.handler, "list_locations");
  assertEquals(matchRoute("GET", "/v1/locations/a%20b")?.params.id, "a b");
});

Deno.test("POST numa rota só-GET → matchRoute null, mas pathExists true (vira 405, não 404)", () => {
  assertEquals(matchRoute("POST", "/v1/locations"), null);
  assertEquals(pathExists("/v1/locations"), true);
});

Deno.test("normalizePath sem /v1 devolve o próprio path", () => {
  assertEquals(normalizePath("/health"), "/health");
});

Deno.test("extractApiKey aceita Bearer e X-API-Key", () => {
  assertEquals(extractApiKey(new Headers({ Authorization: "Bearer mp_live_abc" })), "mp_live_abc");
  assertEquals(extractApiKey(new Headers({ "X-API-Key": "mp_test_xyz" })), "mp_test_xyz");
  assertEquals(extractApiKey(new Headers({})), null);
});

Deno.test("keyPrefix = 16 primeiros chars; hasScope confere escopo", () => {
  assertEquals(keyPrefix("mp_live_8Kf2c1aQrest"), "mp_live_8Kf2c1aQ");
  assertEquals(hasScope(["bookings:read", "bookings:write"], "bookings:write"), true);
  assertEquals(hasScope(["bookings:read"], "bookings:write"), false);
  assertEquals(hasScope(null, "x"), false);
});

Deno.test("sha256Hex casa com vetor conhecido (string vazia)", async () => {
  assertEquals(
    await sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

Deno.test("pgErrorToHttp mapeia SQLSTATE → HTTP", () => {
  assertEquals(pgErrorToHttp({ code: "42501", message: "Sem permissão" }).status, 403);
  assertEquals(pgErrorToHttp({ code: "P0001", message: "Reserva não encontrada nesta empresa." }).status, 404);
  assertEquals(pgErrorToHttp({ code: "P0001", message: "Check-out precisa ser após o check-in" }).status, 422);
  assertEquals(pgErrorToHttp({ code: "XX000", message: "boom" }).status, 500);
});

Deno.test("pgErrorToHttp: unicidade → 409, input malformado → 422", () => {
  assertEquals(pgErrorToHttp({ code: "23505", message: "x" }).status, 409);
  assertEquals(pgErrorToHttp({ code: "23505", message: "x" }).code, "conflict");
  // uuid inválido, data inválida, not-null, FK, check → 422
  for (const code of ["22P02", "22007", "23502", "23503", "23514"]) {
    assertEquals(pgErrorToHttp({ code, message: "x" }).status, 422, `${code} → 422`);
  }
});

// Segurança: mensagem crua do Postgres NUNCA vaza para o cliente (nome de constraint/coluna).
// Só a nossa mensagem de negócio (P0001, levantada por RAISE nas RPCs) é propagada.
Deno.test("pgErrorToHttp não vaza a mensagem crua do Postgres", () => {
  const leak = 'duplicate key value violates unique constraint "coupon_company_id_code_key"';
  assertEquals(pgErrorToHttp({ code: "23505", message: leak }).message.includes("constraint"), false);
  const uuidLeak = 'invalid input syntax for type uuid: "abc"';
  assertEquals(pgErrorToHttp({ code: "22P02", message: uuidLeak }).message.includes("uuid"), false);
  assertEquals(pgErrorToHttp({ code: "XX000", message: "internal detail" }).message, "Erro interno.");
  // a nossa mensagem de negócio (P0001) CONTINUA sendo mostrada
  assertEquals(
    pgErrorToHttp({ code: "P0001", message: "Check-out precisa ser após o check-in" }).message,
    "Check-out precisa ser após o check-in",
  );
});
