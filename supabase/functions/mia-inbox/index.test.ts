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
  const corpo = corpoParaOBeastBots("assumir", "uid-do-jwt", "Kallef", {
    threadId: "movepark-hub:whatsapp:x",
    // O navegador tentando dizer quem assumiu. Nao pode passar.
    assumidaPor: "outro-admin",
  } as any);
  assertEquals(corpo.assumidaPor, "uid-do-jwt");
});

Deno.test("campo desconhecido do navegador nao chega ao BeastBots", () => {
  const corpo = corpoParaOBeastBots("marcar", "uid", "Kallef", {
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
  assertEquals(corpoParaOBeastBots("marcar", "uid", "Kallef", { threadId: "t", lidaAte: null }).lidaAte, null);
});

Deno.test("listar nao carrega threadId", () => {
  const corpo = corpoParaOBeastBots("listar", "uid", "Kallef", { threadId: "t", limite: 10 });
  assertEquals("threadId" in corpo, false);
  assertEquals(corpo.limite, 10);
});

Deno.test("responder leva o texto e quem escreveu", () => {
  const corpo = corpoParaOBeastBots("responder", "uid", "Kallef", { threadId: "t", texto: "ola" });
  assertEquals(corpo.texto, "ola");
  assertEquals(corpo.assumidaPor, "uid");
});

// A acao precisa estar na lista fechada, senao a Edge devolve 400 e a tela para de
// carregar. Aconteceu: o front pedia `anexo` e a Edge recusava.
Deno.test("a acao de anexo passa, e o compartilhamento nao existe mais", () => {
  assertEquals(acaoValida("anexo"), true);
  // O link publico de leitura saiu: a conversa se leva em texto, pelo "Copiar conversa".
  assertEquals(acaoValida("compartilhar"), false);
  assertEquals(acaoValida("descompartilhar"), false);
});

Deno.test("anexo leva a mensagem e a parte, e nada mais", () => {
  const corpo = corpoParaOBeastBots("anexo", "uid", "Kallef", {
    threadId: "t", messageId: "m1", parte: 2, texto: "ignorado",
  } as never);
  assertEquals(Object.keys(corpo).sort().join(","), "acao,agentId,messageId,parte,threadId");
  assertEquals(corpo.parte, 2);
});

Deno.test("listar leva busca e cursor ao BeastBots", () => {
  // Regressao de 27/08: o portao montava o corpo campo a campo e nao copiava
  // `busca` nem `cursor`. A lista respondia 200 e devolvia sempre a primeira
  // pagina, entao a busca "funcionava" sem filtrar e a rolagem infinita repetia
  // as mesmas 30 conversas.
  const corpo = corpoParaOBeastBots("listar", "uid", "Kallef", {
    limite: 30,
    busca: "voucher",
    cursor: "2026-08-27T20:00:00.000Z",
  });
  assertEquals(corpo.busca, "voucher");
  assertEquals(corpo.cursor, "2026-08-27T20:00:00.000Z");
});

Deno.test("busca gigante e' cortada antes de virar consulta", () => {
  const corpo = corpoParaOBeastBots("listar", "uid", "Kallef", { busca: "a".repeat(500) });
  assertEquals(String(corpo.busca).length, 120);
});

Deno.test("o nome de quem responde vem do perfil, nao do corpo", () => {
  // A tela tem dois lados direitos, a Mia e a equipe. Sem nome eles se confundem.
  // O nome sai do perfil de quem tem o JWT: aceitar do corpo deixaria um admin
  // assinar como outro.
  const corpo = corpoParaOBeastBots("responder", "uid", "Kallef Alexandre", {
    threadId: "t",
    texto: "ola",
    assumidaPorNome: "Outro Admin",
  } as any);
  assertEquals(corpo.assumidaPorNome, "Kallef Alexandre");
});

Deno.test("so' responder carrega o nome", () => {
  assertEquals("assumidaPorNome" in corpoParaOBeastBots("marcar", "uid", "Kallef", { threadId: "t" }), false);
});
