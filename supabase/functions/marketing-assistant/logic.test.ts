import { assertEquals } from "jsr:@std/assert";
import {
  acaoRecente,
  decidirConfirmacao,
  dentroDoLimite,
  lerConfig,
  lerCorpo,
  memoriaDe,
  novoToken,
  pedidoDeConversa,
  repassarStream,
  resumoDoResultado,
} from "./logic.ts";

const CONV = "11111111-2222-3333-4444-555555555555";
const PROP = "99999999-8888-7777-6666-555555555555";
const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const fala = { id: "m1", role: "user", parts: [{ type: "text", text: "Quem sumiu?" }] };

Deno.test("lerCorpo aceita as sete ações com o que cada uma exige", () => {
  assertEquals(lerCorpo({ acao: "conversar", conversa_id: CONV, mensagem: fala }).ok, true);
  assertEquals(lerCorpo({ acao: "conversas" }).ok, true);
  assertEquals(lerCorpo({ acao: "abrir", conversa_id: CONV }).ok, true);
  assertEquals(lerCorpo({ acao: "apagar", conversa_id: CONV }).ok, true);
  assertEquals(lerCorpo({ acao: "renomear", conversa_id: CONV, titulo: "Volta" }).ok, true);
  assertEquals(lerCorpo({ acao: "confirmar", proposta_id: PROP }).ok, true);
  assertEquals(lerCorpo({ acao: "descartar", proposta_id: PROP }).ok, true);
});

Deno.test("lerCorpo recusa o que não é do contrato", () => {
  assertEquals(lerCorpo({ acao: "conversar", conversa_id: "x", mensagem: fala }).ok, false);
  assertEquals(lerCorpo({ acao: "conversar", conversa_id: CONV, mensagem: { ...fala, role: "assistant" } }).ok, false);
  assertEquals(
    lerCorpo({ acao: "conversar", conversa_id: CONV, mensagem: { ...fala, parts: [{ type: "text", text: "x".repeat(4001) }] } }).ok,
    false,
  );
  assertEquals(lerCorpo({ acao: "renomear", conversa_id: CONV, titulo: "   " }).ok, false);
  assertEquals(lerCorpo({ acao: "confirmar", proposta_id: "drop table" }).ok, false);
  assertEquals(lerCorpo({ acao: "exportar" }).ok, false);
  assertEquals(lerCorpo(null).ok, false);
});

Deno.test("renomear corta o título em uma linha de até 80 caracteres", () => {
  const r = lerCorpo({ acao: "renomear", conversa_id: CONV, titulo: ` Volta\n${"x".repeat(100)} ` });
  assertEquals(r.ok && r.corpo.acao === "renomear" && r.corpo.titulo.length, 80);
  assertEquals(r.ok && r.corpo.acao === "renomear" && r.corpo.titulo.includes("\n"), false);
});

Deno.test("lerConfig cai no padrão com valor torto e respeita enabled false", () => {
  assertEquals(lerConfig(null), { enabled: true, max_turns_per_user_hour: 60 });
  assertEquals(lerConfig("{x"), { enabled: true, max_turns_per_user_hour: 60 });
  assertEquals(lerConfig('{"enabled": false, "max_turns_per_user_hour": 10}'), { enabled: false, max_turns_per_user_hour: 10 });
});

Deno.test("dentroDoLimite barra chave desligada e teto estourado", () => {
  assertEquals(dentroDoLimite({ enabled: true, max_turns_per_user_hour: 60 }, 59), null);
  assertEquals(dentroDoLimite({ enabled: true, max_turns_per_user_hour: 60 }, 60) !== null, true);
  assertEquals(dentroDoLimite({ enabled: false, max_turns_per_user_hour: 60 }, 0) !== null, true);
});

Deno.test("a memória nasce do id do JWT, nunca do corpo", () => {
  assertEquals(memoriaDe(USER, CONV), {
    resource: `movepark-marketing:hub:${USER}`,
    thread: `movepark-marketing:hub:${USER}:${CONV}`,
  });
  const p = pedidoDeConversa(USER, { acao: "renomear", conversaId: CONV, titulo: "Volta" });
  assertEquals(p, {
    acao: "renomear",
    resource: `movepark-marketing:hub:${USER}`,
    thread: `movepark-marketing:hub:${USER}:${CONV}`,
    titulo: "Volta",
  });
  assertEquals(pedidoDeConversa(USER, { acao: "conversas" }), { acao: "listar", resource: `movepark-marketing:hub:${USER}` });
});

Deno.test("novoToken tem prefixo mpm_ e 48 hex", () => {
  assertEquals(novoToken(new Uint8Array(24).fill(255)), "mpm_" + "ff".repeat(24));
});

Deno.test("decidirConfirmacao: dono, estado, validade e problema", () => {
  const agora = new Date("2026-11-26T12:00:00Z");
  const base = {
    id: PROP,
    profile_id: USER,
    status: "proposed",
    expires_at: "2026-11-26T12:10:00Z",
    tool: "marketing_run_campaign",
    args: {},
  };
  assertEquals(decidirConfirmacao(base, USER, agora), { tipo: "executar" });
  assertEquals(decidirConfirmacao(null, USER, agora).tipo, "recusar");
  assertEquals(decidirConfirmacao({ ...base, profile_id: "outro" }, USER, agora), {
    tipo: "recusar",
    status: 404,
    erro: "Proposta não encontrada.",
  });
  assertEquals(decidirConfirmacao({ ...base, status: "blocked" }, USER, agora).tipo, "recusar");
  assertEquals(decidirConfirmacao({ ...base, status: "executed" }, USER, agora), { tipo: "estado" });
  assertEquals(decidirConfirmacao({ ...base, status: "executing" }, USER, agora), { tipo: "estado" });
  assertEquals(decidirConfirmacao({ ...base, expires_at: "2026-11-26T11:59:00Z" }, USER, agora).tipo, "recusar");
});

Deno.test("resumoDoResultado diz o que aconteceu, inclusive com a chave desligada", () => {
  assertEquals(
    resumoDoResultado("marketing_run_campaign", { enrolled: 31, sent: 0, dispatchEnabled: false }),
    "31 matrículas, 0 envios agora. Chave geral desligada: nada saiu para cliente.",
  );
  assertEquals(resumoDoResultado("marketing_set_dispatch_enabled", { enabled: false }), "Chave geral desligada.");
});

Deno.test("acaoRecente leva o resumo, ou o erro, para o agente", () => {
  assertEquals(
    acaoRecente({ id: PROP, tool: "marketing_run_campaign", status: "executed", resultado: { resumo: "31 matrículas" }, erro: null }),
    { proposta_id: PROP, tool: "marketing_run_campaign", status: "executed", resultado: "31 matrículas" },
  );
  assertEquals(
    acaoRecente({ id: PROP, tool: "marketing_run_campaign", status: "failed", resultado: null, erro: "Campanha sem segmento." }).resultado,
    "Campanha sem segmento.",
  );
});

async function lerTudo(s: ReadableStream<Uint8Array>) {
  const r = s.getReader();
  const partes: string[] = [];
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    partes.push(new TextDecoder().decode(value));
  }
  return partes.join("");
}

Deno.test("repassarStream entrega tudo e encerra o token uma vez no fim", async () => {
  let encerrou = 0;
  const origem = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode("data: a\n\n"));
      c.enqueue(new TextEncoder().encode("data: b\n\n"));
      c.close();
    },
  });
  assertEquals(await lerTudo(repassarStream(origem, () => { encerrou++; })), "data: a\n\ndata: b\n\n");
  await new Promise((r) => setTimeout(r, 0));
  assertEquals(encerrou, 1);
});

Deno.test("repassarStream encerra o token quando a página cancela no meio", async () => {
  let encerrou = 0;
  const origem = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}) });
  const saida = repassarStream(origem, () => { encerrou++; });
  await saida.cancel();
  await new Promise((r) => setTimeout(r, 0));
  assertEquals(encerrou, 1);
});

Deno.test("repassarStream encerra o token quando a origem quebra", async () => {
  let encerrou = 0;
  const origem = new ReadableStream<Uint8Array>({ start: (c) => c.error(new Error("caiu")) });
  await lerTudo(repassarStream(origem, () => { encerrou++; })).catch(() => {});
  await new Promise((r) => setTimeout(r, 0));
  assertEquals(encerrou, 1);
});
