// Testes de branch da Edge mia-chat. Nenhum toca no banco nem revela o token.
import { assertEquals } from "jsr:@std/assert";
import { handler, identidadeDeTeste } from "./index.ts";

const URL = "http://localhost/functions/v1/mia-chat";

Deno.test("OPTIONS responde 200 com CORS", async () => {
  const res = await handler(new Request(URL, { method: "OPTIONS" }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("método diferente de POST é 405", async () => {
  const res = await handler(new Request(URL, { method: "GET" }));
  assertEquals(res.status, 405);
});

Deno.test("sem Authorization é 401, e não vaza o token", async () => {
  // A checagem do header vem ANTES de ler o segredo do ambiente. Se um dia inverter,
  // uma requisição anônima passaria a poder falar com a Mia por conta da casa.
  Deno.env.set("MASTRA_ADMIN_TOKEN", "mk_segredo_de_teste");
  Deno.env.set("MASTRA_BASE_URL", "https://beast-bots.exemplo");

  const res = await handler(
    new Request(URL, { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "oi" }] }) }),
  );
  assertEquals(res.status, 401);
  assertEquals((await res.text()).includes("mk_segredo_de_teste"), false);
});

// A identidade mudou de lugar (era do navegador, virou da Edge). Os invariantes vieram
// junto, porque sao eles que impedem o Backoffice de devolver dado de cliente real.

Deno.test("NAO usa telefone real: a Mia trata o numero como prova de posse (D43)", () => {
  assertEquals(
    identidadeDeTeste("u1", "Kallef").requestContext["movepark.customerPhone"],
    "5500000000000",
  );
});

Deno.test("usa uma das origens que o white-label aceita", () => {
  const origem = identidadeDeTeste("u1", null).requestContext["movepark.origin"];
  assertEquals(["reserva-online", "whatsapp-bot", "webchat-bot"].includes(origem), true);
});

Deno.test("separa a memoria por usuario", () => {
  assertEquals(
    identidadeDeTeste("u1", null).memory.thread === identidadeDeTeste("u2", null).memory.thread,
    false,
  );
});

Deno.test("respeita o prefixo do guarda de namespace do BeastBots", () => {
  const { memory } = identidadeDeTeste("u1", null);
  assertEquals(memory.resource.startsWith("movepark-hub:"), true);
  assertEquals(memory.thread.startsWith("movepark-hub:"), true);
});

Deno.test("sem nome, cai num rotulo que diz que e teste", () => {
  assertEquals(identidadeDeTeste("u1", null).requestContext["movepark.customerName"], "Backoffice (teste)");
});
