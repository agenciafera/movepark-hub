import { assertEquals } from "jsr:@std/assert";
import {
  classifyTransferResponse,
  decidePreflight,
  nuncaFoiAoGateway,
  parseTransferInput,
  transferRowStatus,
} from "./logic.ts";

Deno.test("parseTransferInput: exige empresa e valor", () => {
  assertEquals(parseTransferInput(null).error, "company_id é obrigatório.");
  assertEquals(parseTransferInput({ company_id: "c1" }).error, "amount_cents é obrigatório.");
});

Deno.test("parseTransferInput: valor tem que ser inteiro positivo em centavos", () => {
  assertEquals(parseTransferInput({ company_id: "c1", amount_cents: 0 }).input, null);
  assertEquals(parseTransferInput({ company_id: "c1", amount_cents: -5 }).input, null);
  assertEquals(parseTransferInput({ company_id: "c1", amount_cents: 10.5 }).input, null);
  assertEquals(parseTransferInput({ company_id: "c1", amount_cents: "7650" }).input, null);
});

Deno.test("parseTransferInput: pedido válido passa", () => {
  const { input } = parseTransferInput({ company_id: "c1", amount_cents: 7650 });
  assertEquals(input, { companyId: "c1", amountCents: 7650 });
});

Deno.test("decidePreflight: saldo suficiente libera", () => {
  assertEquals(decidePreflight({ amountCents: 7650, availableCents: 11329 }).ok, true);
});

Deno.test("decidePreflight: saldo exato libera", () => {
  assertEquals(decidePreflight({ amountCents: 7650, availableCents: 7650 }).ok, true);
});

Deno.test("decidePreflight: saldo insuficiente barra e diz quanto falta", () => {
  const d = decidePreflight({ amountCents: 7650, availableCents: 1000 });
  assertEquals(d.ok, false);
  assertEquals(d.reason?.includes("66,50"), true);
});

Deno.test("decidePreflight: saldo desconhecido barra, em vez de tentar às cegas", () => {
  // Melhor recusar com motivo do que mandar um repasse que o gateway vai recusar por saldo.
  assertEquals(decidePreflight({ amountCents: 100, availableCents: null }).ok, false);
});

// ── O que a linha do repasse vira depois da resposta do gateway ─────────────
// Achado da varredura de 15/09/2026: tudo que não era `transferred` virava `processing`, inclusive
// `failed` e `canceled`, e a linha em `processing` segura a empresa (conta como repassado e ocupa o
// índice de um repasse em andamento). Status terminal de falha tem que liberar.

Deno.test("transferRowStatus: transferred e paid fecham como pago", () => {
  assertEquals(transferRowStatus("transferred"), "paid");
  assertEquals(transferRowStatus("paid"), "paid");
});

Deno.test("transferRowStatus: failed e canceled são terminais e liberam a empresa", () => {
  assertEquals(transferRowStatus("failed"), "failed");
  assertEquals(transferRowStatus("with_error"), "failed");
  assertEquals(transferRowStatus("canceled"), "canceled");
  assertEquals(transferRowStatus("cancelled"), "canceled");
});

Deno.test("transferRowStatus: em curso ou desconhecido fica processing, nunca pago por chute", () => {
  assertEquals(transferRowStatus("pending_transfer"), "processing");
  assertEquals(transferRowStatus("processing"), "processing");
  assertEquals(transferRowStatus("created"), "processing");
  assertEquals(transferRowStatus(null), "processing");
  assertEquals(transferRowStatus("status_novo_do_gateway"), "processing");
});

Deno.test("classifyTransferResponse: 2xx com id é enviado", () => {
  assertEquals(
    classifyTransferResponse({ httpStatus: 200, transferId: "539", rawStatus: "transferred" }),
    { kind: "sent", rowStatus: "paid" },
  );
});

Deno.test("classifyTransferResponse: 4xx é recusa definitiva, a linha falha e libera", () => {
  assertEquals(
    classifyTransferResponse({ httpStatus: 422, transferId: null, rawStatus: null }).kind,
    "rejected",
  );
  assertEquals(
    classifyTransferResponse({ httpStatus: 400, transferId: null, rawStatus: null }).kind,
    "rejected",
  );
});

Deno.test("classifyTransferResponse: estado incerto mantém a linha para retentar com a MESMA chave", () => {
  // 5xx, sem resposta, timeout, conflito de idempotência e rate limit: o dinheiro pode ter saído.
  // Liberar aqui e deixar nascer uma linha nova, com chave nova, é o caminho do repasse em dobro.
  for (const httpStatus of [500, 502, 503, 504, 408, 409, 429, 0, null]) {
    assertEquals(
      classifyTransferResponse({ httpStatus, transferId: null, rawStatus: null }).kind,
      "uncertain",
      `HTTP ${httpStatus}`,
    );
  }
});

Deno.test("classifyTransferResponse: 2xx SEM id é incerto, não enviado", () => {
  assertEquals(
    classifyTransferResponse({ httpStatus: 200, transferId: null, rawStatus: null }).kind,
    "uncertain",
  );
});

Deno.test("nuncaFoiAoGateway: linha limpa nunca tentou, pode ser cancelada no pré-voo", () => {
  assertEquals(nuncaFoiAoGateway({ external_transfer_id: null, failed_reason: null, raw: null }), true);
});

Deno.test("nuncaFoiAoGateway: linha com tentativa anterior NÃO é cancelável no pré-voo", () => {
  // Uma tentativa que caiu em timeout pode ter movido o dinheiro, e aí o saldo insuficiente de agora
  // é justamente o reflexo dela. Cancelar e abrir chave nova pagaria duas vezes.
  assertEquals(
    nuncaFoiAoGateway({ external_transfer_id: null, failed_reason: "HTTP 504", raw: null }),
    false,
  );
  assertEquals(
    nuncaFoiAoGateway({ external_transfer_id: null, failed_reason: null, raw: { message: "x" } }),
    false,
  );
  assertEquals(
    nuncaFoiAoGateway({ external_transfer_id: "539", failed_reason: null, raw: null }),
    false,
  );
});
