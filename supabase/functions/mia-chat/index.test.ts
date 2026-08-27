// Testes de branch da Edge mia-chat. Nenhum toca no banco nem revela o token.
import { assertEquals } from "jsr:@std/assert";
import { falasDoHistorico, handler, identidadeDeTeste, origemValida, telefoneValido } from "./index.ts";

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

Deno.test("sem escolha, o telefone e o de ninguem", () => {
  // O padrao continua sendo o numero falso: quem so abriu a bolinha para conversar nao
  // deve esbarrar em reserva de cliente nenhum.
  assertEquals(
    identidadeDeTeste("u1", "Kallef").requestContext["movepark.customerPhone"],
    "5500000000000",
  );
});

Deno.test("o telefone escolhido chega ao contexto", () => {
  // Desde 27/08 a bancada simula cliente de verdade, e e' para isso que ela serve.
  assertEquals(
    identidadeDeTeste("u1", null, "5541988149449").requestContext["movepark.customerPhone"],
    "5541988149449",
  );
});

Deno.test("usa uma das origens que o white-label aceita", () => {
  const origem = identidadeDeTeste("u1", null).requestContext["movepark.origin"];
  assertEquals(["reserva-online", "whatsapp-bot", "webchat-bot"].includes(origem), true);
  assertEquals(
    identidadeDeTeste("u1", null, "5500000000000", "whatsapp-bot").requestContext["movepark.origin"],
    "whatsapp-bot",
  );
});

Deno.test("a thread de teste NUNCA e a do WhatsApp de verdade", () => {
  // O namespace real e' `movepark-hub:whatsapp:<telefone>:main` (conversation.ts do
  // BeastBots). Reusa-lo faria a mensagem de teste do admin entrar na conversa daquele
  // cliente, e daria a ele o historico dela de brinde.
  const telefone = "5541988149449";
  const real = `movepark-hub:whatsapp:${telefone}:main`;
  const { memory } = identidadeDeTeste("u1", null, telefone);
  assertEquals(memory.thread === real, false);
  assertEquals(memory.thread.includes(":whatsapp:"), false);
  assertEquals(memory.thread.includes("manager"), true);
});

Deno.test("dois telefones simulados nao dividem conversa", () => {
  assertEquals(
    identidadeDeTeste("u1", null, "5541988149449").memory.thread ===
      identidadeDeTeste("u1", null, "5511987727182").memory.thread,
    false,
  );
});

Deno.test("telefoneValido exige DDI 55 e tamanho de numero brasileiro", () => {
  assertEquals(telefoneValido("5541988149449"), "5541988149449");
  assertEquals(telefoneValido("(55) 41 98814-9449"), "5541988149449");
  assertEquals(telefoneValido("554133334444"), "554133334444"); // fixo, 12 digitos
  // Curto, longo e sem DDI nao passam: mandar lixo ao parceiro devolve erro sem sentido.
  assertEquals(telefoneValido("41988149449"), null);
  assertEquals(telefoneValido("55419"), null);
  assertEquals(telefoneValido("55419881494499999"), null);
  assertEquals(telefoneValido(42), null);
});

Deno.test("origemValida recusa valor fora da lista do white-label", () => {
  assertEquals(origemValida("webchat-bot"), true);
  assertEquals(origemValida("whatsapp-bot"), true);
  // Valor livre nao falha aqui: falha ao fechar a reserva no parceiro, longe de quem digitou.
  assertEquals(origemValida("instagram"), false);
  assertEquals(origemValida(""), false);
  assertEquals(origemValida(null), false);
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


// --- Historico: a tela precisa abrir onde a conversa parou ---
// A memoria vive no servidor e sobrevive ao F5; a lista da tela nao. Sem carregar,
// recarregar mostrava conversa vazia enquanto a Mia lembrava de tudo, e a bancada mentia
// sobre o proprio estado.

Deno.test("le o formato que o Mastra devolve hoje", () => {
  const doMastra = {
    messages: [
      { role: "user", content: { format: 2, parts: [{ type: "text", text: "oi" }], content: "oi" } },
      { role: "assistant", content: { format: 2, parts: [{ type: "text", text: "ola!" }], content: "ola!" } },
    ],
  };
  assertEquals(falasDoHistorico(doMastra), [
    { role: "user", text: "oi" },
    { role: "model", text: "ola!" },
  ]);
});

Deno.test("cai para as parts quando nao ha content pronto", () => {
  // O formato do Mastra ja mudou antes; ler os dois caminhos evita a tela vazia silenciosa.
  const so_parts = {
    messages: [{ role: "user", content: { parts: [{ type: "text", text: "primeira" }, { type: "text", text: "segunda" }] } }],
  };
  assertEquals(falasDoHistorico(so_parts), [{ role: "user", text: "primeira\nsegunda" }]);
});

Deno.test("descarta mensagem sem texto, que viraria balao vazio", () => {
  // Chamada de tool grava mensagem de assistente cujas partes sao `tool-invocation`.
  const comTool = {
    messages: [
      { role: "assistant", content: { parts: [{ type: "tool-invocation", toolInvocation: {} }] } },
      { role: "assistant", content: { parts: [{ type: "text", text: "  pronto  " }] } },
    ],
  };
  assertEquals(falasDoHistorico(comTool), [{ role: "model", text: "pronto" }]);
});

Deno.test("papel desconhecido vira model, nunca user", () => {
  // Desenhar fala do agente como se fosse do cliente inverteria a leitura do teste.
  assertEquals(falasDoHistorico({ messages: [{ role: "system", content: "x" }] }), [
    { role: "model", text: "x" },
  ]);
});

Deno.test("corpo inesperado vira lista vazia, e nao excecao", () => {
  assertEquals(falasDoHistorico(null), []);
  assertEquals(falasDoHistorico({}), []);
  assertEquals(falasDoHistorico({ messages: "nao e lista" }), []);
});
