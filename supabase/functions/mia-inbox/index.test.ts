// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "jsr:@std/assert";
import { acaoValida, corpoParaOBeastBots, handler } from "./index.ts";

const URL_ = "http://localhost/mia-inbox";

Deno.test("OPTIONS devolve CORS", async () => {
  const res = await handler(new Request(URL_, { method: "OPTIONS" }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("metodo diferente de POST e recusado", async () => {
  const res = await handler(new Request(URL_, { method: "GET" }));
  assertEquals(res.status, 405);
});

Deno.test("sem Authorization e 401, e nao vaza o token", async () => {
  Deno.env.set("MASTRA_ADMIN_TOKEN", "mk_segredo_de_teste");
  Deno.env.set("MASTRA_BASE_URL", "https://beast-bots.exemplo");
  const res = await handler(
    new Request(URL_, { method: "POST", body: JSON.stringify({ acao: "listar" }) }),
  );
  assertEquals(res.status, 401);
  assertEquals((await res.text()).includes("mk_segredo_de_teste"), false);
});

// --- A lista fechada de acoes ---
// Tudo que passa por aqui roda no BeastBots com o token de admin. Acao nova entra de
// proposito, nao por acidente.
Deno.test("acao fora da lista e recusada", () => {
  assertEquals(acaoValida("listar"), true);
  assertEquals(acaoValida("responder"), true);
  assertEquals(acaoValida("apagar"), false);
  assertEquals(acaoValida(""), false);
  assertEquals(acaoValida(null), false);
});

// --- O corpo e montado campo a campo, nunca repassado ---
Deno.test("quem assumiu sai do JWT, nunca do corpo", () => {
  const corpo = corpoParaOBeastBots("assumir", "uid-do-jwt", {
    threadId: "movepark-hub:whatsapp:x",
    // O navegador tentando dizer quem assumiu. Nao pode passar.
    assumidaPor: "outro-admin",
  } as any);
  assertEquals(corpo.assumidaPor, "uid-do-jwt");
});

Deno.test("campo desconhecido do navegador nao chega ao BeastBots", () => {
  const corpo = corpoParaOBeastBots("marcar", "uid", {
    threadId: "t",
    lidaAte: "2026-01-01",
    agentId: "go2park",
    inventado: "x",
  } as any);
  assertEquals(Object.keys(corpo).sort().join(","), "acao,agentId,lidaAte,threadId");
  // O agente e' cravado aqui: aceitar do corpo abriria a conversa do outro tenant.
  assertEquals(corpo.agentId, "movepark-hub");
});

Deno.test("marcar como nao lida preserva o nulo", () => {
  assertEquals(corpoParaOBeastBots("marcar", "uid", { threadId: "t", lidaAte: null }).lidaAte, null);
});

Deno.test("listar nao carrega threadId", () => {
  const corpo = corpoParaOBeastBots("listar", "uid", { threadId: "t", limite: 10 });
  assertEquals("threadId" in corpo, false);
  assertEquals(corpo.limite, 10);
});

Deno.test("responder leva o texto e quem escreveu", () => {
  const corpo = corpoParaOBeastBots("responder", "uid", { threadId: "t", texto: "ola" });
  assertEquals(corpo.texto, "ola");
  assertEquals(corpo.assumidaPor, "uid");
});
