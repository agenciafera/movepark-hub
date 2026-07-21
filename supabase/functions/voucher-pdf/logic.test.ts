import { assertEquals } from "jsr:@std/assert";
import { checkVoucherAuth, checkVoucherBooking, checkVoucherCode } from "./logic.ts";
import { VOUCHER_BOOKING_STATUSES } from "../_shared/voucher/fields.ts";

// ── C-15 · Voucher não existe antes da confirmação ──────────────────────────
// Roteiro: docs/testes/roteiro-consumidor-reserva.md (C-15).
//
// Divergência conhecida entre servidor e tela, registrada de propósito: o servidor aceita
// `completed` (VOUCHER_BOOKING_STATUSES em _shared/voucher/fields.ts:63), mas a UI só mostra o
// botão de baixar em `confirmed` e `checked_in` (src/routes/bookings-detail.tsx:99). Reserva já
// concluída tem voucher válido pela Edge e nenhum botão na tela. Este teste trava o contrato do
// servidor. Se o produto decidir alinhar os dois, mude os dois lugares juntos.

Deno.test("checkVoucherAuth: exige Bearer no header", () => {
  assertEquals(checkVoucherAuth(null), { status: 401, error: "Autenticação necessária" });
  assertEquals(checkVoucherAuth(""), { status: 401, error: "Autenticação necessária" });
  assertEquals(checkVoucherAuth("Basic abc"), { status: 401, error: "Autenticação necessária" });
  assertEquals(checkVoucherAuth("Bearer jwt-do-dono"), null);
});

Deno.test("checkVoucherCode: code é obrigatório", () => {
  assertEquals(checkVoucherCode(undefined), { status: 400, error: "code é obrigatório" });
  assertEquals(checkVoucherCode(""), { status: 400, error: "code é obrigatório" });
  assertEquals(checkVoucherCode("MP-A8K7P2"), null);
});

Deno.test("C-15: reserva pendente não emite voucher (422)", () => {
  assertEquals(checkVoucherBooking({ status: "pending" }), {
    status: 422,
    error: "Voucher disponível só após a confirmação do pagamento.",
  });
});

Deno.test("C-15: só confirmed, checked_in e completed emitem voucher", () => {
  for (const status of ["confirmed", "checked_in", "completed"]) {
    assertEquals(checkVoucherBooking({ status }), null, `${status} deveria emitir voucher`);
  }
  // O catálogo é a fonte da verdade do gate; se alguém mexer nele, este teste avisa.
  assertEquals([...VOUCHER_BOOKING_STATUSES], ["confirmed", "checked_in", "completed"]);
});

Deno.test("C-15: status fora do catálogo é recusado com 422", () => {
  for (const status of ["pending", "cancelled", "expired", "no_show"]) {
    assertEquals(
      checkVoucherBooking({ status }),
      { status: 422, error: "Voucher disponível só após a confirmação do pagamento." },
      `${status} não pode emitir voucher`,
    );
  }
});

/**
 * Cuidado ao ler o teste acima: ele cobre a função pura, e três dos quatro status
 * ali NÃO chegam nela em produção.
 *
 * A Edge filtra `.is("deleted_at", null)` na consulta, ANTES do gate de status
 * (index.ts, na leitura escopada pela RLS). O cancelamento grava `deleted_at`
 * junto com o status (`cancel_booking_with_release`), então reserva cancelada
 * some da consulta e cai em `checkVoucherBooking(null)`, que devolve **404**.
 *
 * Medido em produção com a MP-449353: 404, não 422.
 *
 * Ou seja, na prática o único status que produz 422 é `pending`. Não vá confiar
 * no 422 para detectar reserva cancelada; o que você vai receber é 404.
 */
Deno.test("C-15: reserva soft-deletada cai no 404, não no 422 do status", () => {
  // A consulta com `deleted_at is null` não devolve linha, e é esse null que chega aqui.
  assertEquals(checkVoucherBooking(null), { status: 404, error: "Reserva não encontrada" });
});

Deno.test("C-15: reserva de outro usuário é recusada com 404", () => {
  // A leitura roda no client do usuário, então a RLS já filtrou a reserva alheia e a linha chega
  // nula aqui. A Edge responde 404 (e não 403) de propósito: não confirma que o código existe.
  assertEquals(checkVoucherBooking(null), { status: 404, error: "Reserva não encontrada" });
});
