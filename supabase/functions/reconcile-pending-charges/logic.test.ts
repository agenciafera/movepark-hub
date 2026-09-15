import { assertEquals } from "jsr:@std/assert";
import {
  autorizado,
  BATCH_LIMIT,
  CUTOFF_MINUTES,
  decidirPagamentoPendente,
  pendingCutoffIso,
  venceu,
} from "./logic.ts";

const AGORA = Date.parse("2026-09-15T12:00:00Z");
const VENCIDA = "2026-09-15T10:00:00Z"; // 2h atrás
const VALIDA = "2026-09-15T12:30:00Z"; // daqui a 30 min

Deno.test("gateway diz pago: o banco estava mentindo e precisa ser corrigido", () => {
  assertEquals(
    decidirPagamentoPendente({
      httpStatus: 200,
      chargeStatus: "paid",
      expiresAt: VENCIDA,
      nowMs: AGORA,
    }),
    { tipo: "pagar" },
  );
});

Deno.test("erro ao consultar NUNCA encerra: não saber não é saber que não foi pago", () => {
  for (const httpStatus of [500, 502, 429, 401, 0, null]) {
    const a = decidirPagamentoPendente({
      httpStatus,
      chargeStatus: null,
      expiresAt: VENCIDA,
      nowMs: AGORA,
    });
    assertEquals(a.tipo, "esperar", `HTTP ${httpStatus}`);
  }
});

Deno.test("cobrança inexistente encerra só depois de vencer", () => {
  assertEquals(
    decidirPagamentoPendente({
      httpStatus: 404,
      chargeStatus: null,
      expiresAt: VENCIDA,
      nowMs: AGORA,
    }),
    { tipo: "encerrar", status: "failed", motivo: "cobranca inexistente no gateway" },
  );
  assertEquals(
    decidirPagamentoPendente({ httpStatus: 404, chargeStatus: null, expiresAt: VALIDA, nowMs: AGORA })
      .tipo,
    "esperar",
  );
});

Deno.test("recusada, cancelada e estornada saem de pendente cada uma no seu status", () => {
  const caso = (chargeStatus: "failed" | "canceled" | "refunded") =>
    decidirPagamentoPendente({ httpStatus: 200, chargeStatus, expiresAt: VALIDA, nowMs: AGORA });
  assertEquals(caso("failed"), {
    tipo: "encerrar",
    status: "failed",
    motivo: "recusada no gateway",
  });
  assertEquals(caso("canceled"), {
    tipo: "encerrar",
    status: "cancelled",
    motivo: "cancelada no gateway",
  });
  assertEquals(caso("refunded"), {
    tipo: "encerrar",
    status: "refunded",
    motivo: "estornada no gateway",
  });
});

Deno.test("cartão em análise espera: dinheiro comprometido não é dinheiro recusado", () => {
  assertEquals(
    decidirPagamentoPendente({
      httpStatus: 200,
      chargeStatus: "authorized",
      expiresAt: VENCIDA,
      nowMs: AGORA,
    }).tipo,
    "esperar",
  );
});

Deno.test("pendente com validade em pé continua pendente", () => {
  assertEquals(
    decidirPagamentoPendente({
      httpStatus: 200,
      chargeStatus: "pending",
      expiresAt: VALIDA,
      nowMs: AGORA,
    }),
    { tipo: "esperar", motivo: "cobranca ainda vale" },
  );
});

Deno.test("pendente vencido morre como falho: o PIX daquele dia não pode mais ser pago", () => {
  assertEquals(
    decidirPagamentoPendente({
      httpStatus: 200,
      chargeStatus: "pending",
      expiresAt: VENCIDA,
      nowMs: AGORA,
    }),
    { tipo: "encerrar", status: "failed", motivo: "validade vencida sem pagamento" },
  );
});

Deno.test("sem validade conhecida, nunca encerra por vencimento", () => {
  assertEquals(venceu(null, AGORA), false);
  assertEquals(venceu("nao e data", AGORA), false);
  assertEquals(
    decidirPagamentoPendente({
      httpStatus: 200,
      chargeStatus: "pending",
      expiresAt: null,
      nowMs: AGORA,
    }).tipo,
    "esperar",
  );
});

Deno.test("a margem depois do vencimento existe: no minuto seguinte ainda não morreu", () => {
  const venceuAgora = new Date(AGORA - 60_000).toISOString();
  assertEquals(venceu(venceuAgora, AGORA), false);
  const venceuHaMuito = new Date(AGORA - 30 * 60_000).toISOString();
  assertEquals(venceu(venceuHaMuito, AGORA), true);
});

Deno.test("a janela recua uma hora, para o webhook ter a chance primeiro", () => {
  assertEquals(pendingCutoffIso(AGORA), new Date(AGORA - CUTOFF_MINUTES * 60_000).toISOString());
  assertEquals(CUTOFF_MINUTES >= 30, true);
  assertEquals(BATCH_LIMIT > 0 && BATCH_LIMIT <= 100, true);
});

Deno.test("sem chave no Vault ninguém entra, nem mandando nada", () => {
  assertEquals(autorizado(null, "x"), false);
  assertEquals(autorizado(undefined, null), false);
  assertEquals(autorizado("", ""), false);
  assertEquals(autorizado("k", "outra"), false);
  assertEquals(autorizado("k", "k"), true);
});
