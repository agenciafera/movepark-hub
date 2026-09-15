import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  autorizado,
  BALANCE_TTL_MINUTES,
  decidir,
  decidirSaldo,
  ehAtualizavel,
  precisaSondarRecebedor,
  saldoVencido,
} from "./logic.ts";

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

// ── leitura de saldo (15/09/2026) ────────────────────────────────────────────

Deno.test("saldo nunca lido está vencido, e leitura recente não", () => {
  const agora = Date.parse("2026-09-15T12:00:00Z");
  assertEquals(saldoVencido(null, agora), true);
  assertEquals(saldoVencido("nao e data", agora), true);
  assertEquals(saldoVencido("2026-09-15T11:59:00Z", agora), false);
  assertEquals(saldoVencido("2026-09-15T10:30:00Z", agora), true);
  assertEquals(BALANCE_TTL_MINUTES >= 15, true);
});

Deno.test("resposta boa vira patch com os três valores e o carimbo", () => {
  assertEquals(
    decidirSaldo(
      { httpStatus: 200, availableCents: 52500, waitingFundsCents: 1200, transferredCents: 90000 },
      "2026-09-15T12:00:00.000Z",
    ),
    {
      balance_available_cents: 52500,
      balance_waiting_cents: 1200,
      balance_transferred_cents: 90000,
      balance_synced_at: "2026-09-15T12:00:00.000Z",
    },
  );
});

Deno.test("resposta ruim NÃO vira zero: o parceiro leria que o dinheiro sumiu", () => {
  for (const httpStatus of [401, 404, 429, 500, 0, null]) {
    assertEquals(
      decidirSaldo(
        { httpStatus, availableCents: null, waitingFundsCents: null, transferredCents: null },
        "2026-09-15T12:00:00.000Z",
      ),
      null,
      `HTTP ${httpStatus}`,
    );
  }
});

Deno.test("200 com os três nulos é corpo em outro formato, não conta zerada", () => {
  assertEquals(
    decidirSaldo(
      { httpStatus: 200, availableCents: null, waitingFundsCents: null, transferredCents: null },
      "2026-09-15T12:00:00.000Z",
    ),
    null,
  );
});

Deno.test("conta de verdade zerada é gravada: 200 com um valor conhecido basta", () => {
  const p = decidirSaldo(
    { httpStatus: 200, availableCents: 0, waitingFundsCents: null, transferredCents: 90000 },
    "2026-09-15T12:00:00.000Z",
  );
  assertEquals(p?.balance_available_cents, 0);
  assertEquals(p?.balance_waiting_cents, 0);
  assertEquals(p?.balance_transferred_cents, 90000);
});

Deno.test("só 404 no saldo justifica perguntar se o recebedor existe", () => {
  assertEquals(precisaSondarRecebedor(404), true);
  for (const s of [200, 401, 429, 500, 0, null]) {
    assertEquals(precisaSondarRecebedor(s), false, `HTTP ${s}`);
  }
});
