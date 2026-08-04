import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { autorizado, decidir, ehAtualizavel } from "./logic.ts";

const RESULTADO = {
  externalId: "rp_123",
  status: "active",
  rawStatus: "active",
  requirements: [],
  raw: { id: "rp_123" },
  httpStatus: 200,
};

Deno.test("sem a chave configurada, ninguém entra", () => {
  // Uma rotina que mexe em repasse não pode ficar aberta porque alguém esqueceu a
  // variável. Sem chave esperada, nem mandar o header certo adianta.
  assertEquals(autorizado(undefined, "qualquer-coisa"), false);
  assertEquals(autorizado("", "qualquer-coisa"), false);
});

Deno.test("chave errada ou ausente no header, recusa", () => {
  assertEquals(autorizado("segredo", null), false);
  assertEquals(autorizado("segredo", "outra"), false);
  assertEquals(autorizado("segredo", "segredo "), false);
});

Deno.test("chave exata entra", () => {
  assertEquals(autorizado("segredo", "segredo"), true);
});

Deno.test("só status não-terminal é reavaliado", () => {
  assertEquals(ehAtualizavel("pending"), true);
  assertEquals(ehAtualizavel("action_required"), true);
});

Deno.test("status terminal NÃO volta para o gateway", () => {
  // Reavaliar um recebedor já ativo é chance de virar o status dele por causa de uma
  // resposta ruim, e recusado que volta a ser consultado vira ruído no parceiro.
  assertEquals(ehAtualizavel("active"), false);
  assertEquals(ehAtualizavel("refused"), false);
  assertEquals(ehAtualizavel("qualquer_coisa"), false);
});

Deno.test("o patch vai para a ficha que foi consultada", () => {
  // A asserção que dá nome ao arquivo. Se o patch caísse noutra linha, o parceiro A
  // passaria a receber com os dados de B e nada na tela denunciaria.
  const d = decidir({ id: "rec-A", status: "pending" }, RESULTADO);
  assertEquals(d.recipientId, "rec-A");
});

Deno.test("o patch NÃO carrega kyc_url nem a validade dele", () => {
  // O poll não emite link. Escrever null aqui apagaria o link vivo que o parceiro
  // abriu no celular, no meio da prova de vida.
  const d = decidir({ id: "rec-A", status: "pending" }, RESULTADO);
  if (d.tipo !== "atualizar") throw new Error("deveria atualizar");
  assertEquals(Object.keys(d.patch).sort(), [
    "last_provider_status",
    "requirements",
    "status",
  ]);
});

Deno.test("gateway sem id não mexe no status, só registra o evento", () => {
  // É o caso do 401 por allowlist de IP. Congelar ou liberar a ficha por causa de uma
  // falha de rede seria decidir repasse com base em erro de infraestrutura.
  const d = decidir(
    { id: "rec-A", status: "pending" },
    { ...RESULTADO, externalId: null, status: "refused", httpStatus: 401 },
  );
  assertEquals(d.tipo, "so_evento");
  assertEquals(d.recipientId, "rec-A");
  assertEquals(d.httpStatus, 401);
});

Deno.test("mudouStatus distingue mudança real de reconfirmação", () => {
  const mudou = decidir({ id: "r", status: "pending" }, RESULTADO);
  const igual = decidir({ id: "r", status: "active" }, RESULTADO);
  if (mudou.tipo !== "atualizar" || igual.tipo !== "atualizar") {
    throw new Error("deveriam atualizar");
  }
  assertEquals(mudou.mudouStatus, true);
  assertEquals(igual.mudouStatus, false);
});
