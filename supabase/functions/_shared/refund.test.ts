import { assertEquals } from "jsr:@std/assert";
import { countOtherLiveBookingPayments, refundShouldCancelBooking } from "./refund.ts";

Deno.test("refundShouldCancelBooking: estorno total cancela só reserva não iniciada", () => {
  // Confirmada/pendente → cancela + libera a vaga
  assertEquals(refundShouldCancelBooking("confirmed"), true);
  assertEquals(refundShouldCancelBooking("pending"), true);
  // Em andamento/concluída/terminal → NÃO cancela (só o estorno reflete no payment)
  assertEquals(refundShouldCancelBooking("checked_in"), false);
  assertEquals(refundShouldCancelBooking("completed"), false);
  assertEquals(refundShouldCancelBooking("no_show"), false);
  assertEquals(refundShouldCancelBooking("cancelled"), false);
  // Ausente → não cancela
  assertEquals(refundShouldCancelBooking(null), false);
  assertEquals(refundShouldCancelBooking(undefined), false);
});

// Regressão MP-07DAE9 (17/10/2026): duas cobranças pagas na mesma reserva. Estornar a cópia pelo
// painel da Pagar.me cancelava a reserva inteira, com o carro do cliente no pátio.
Deno.test("refundShouldCancelBooking: estornar a cópia de uma cobrança em dobro não cancela", () => {
  assertEquals(
    refundShouldCancelBooking("confirmed", { refundedKind: "booking", otherLiveBookingPayments: 1 }),
    false,
  );
  assertEquals(
    refundShouldCancelBooking("confirmed", { refundedKind: "booking", otherLiveBookingPayments: 0 }),
    true,
  );
});

Deno.test("refundShouldCancelBooking: estorno de adicional devolve só o adicional", () => {
  assertEquals(refundShouldCancelBooking("confirmed", { refundedKind: "fare_upgrade" }), false);
  assertEquals(refundShouldCancelBooking("confirmed", { refundedKind: "date_change" }), false);
  // Pagamento antigo sem kind conta como o da reserva.
  assertEquals(refundShouldCancelBooking("confirmed", { refundedKind: null }), true);
});

function fakeAdmin(result: { count: number | null; error: { message: string } | null }) {
  const calls: Record<string, unknown[]> = {};
  const q = {
    select: (...a: unknown[]) => ((calls.select = a), q),
    eq: (...a: unknown[]) => ((calls[`eq:${a[0]}`] = a), q),
    in: (...a: unknown[]) => ((calls.in = a), q),
    neq: (...a: unknown[]) => ((calls.neq = a), Promise.resolve(result)),
  };
  return { admin: { from: (t: string) => ((calls.from = [t]), q) }, calls };
}

Deno.test("countOtherLiveBookingPayments: conta só pagamento da reserva vivo, sem o estornado", async () => {
  const { admin, calls } = fakeAdmin({ count: 1, error: null });
  assertEquals(await countOtherLiveBookingPayments(admin, "bk1", "pay2"), 1);
  assertEquals(calls.from, ["payment"]);
  assertEquals(calls["eq:booking_id"], ["booking_id", "bk1"]);
  assertEquals(calls["eq:kind"], ["kind", "booking"]);
  assertEquals(calls.in, ["status", ["paid", "authorized"]]);
  assertEquals(calls.neq, ["id", "pay2"]);
});

Deno.test("countOtherLiveBookingPayments: erro de leitura nunca libera o cancelamento", async () => {
  const { admin } = fakeAdmin({ count: null, error: { message: "timeout" } });
  assertEquals(await countOtherLiveBookingPayments(admin, "bk1", "pay2"), 1);
});

// Estorno avulso pelo Manager (19/10/2026): mesmo sendo o único pagamento, a reserva fica.
Deno.test("refundShouldCancelBooking: estorno avulso marcado para manter a reserva não cancela", () => {
  assertEquals(
    refundShouldCancelBooking("confirmed", { refundedKind: "booking", otherLiveBookingPayments: 0, keepBooking: true }),
    false,
  );
  assertEquals(
    refundShouldCancelBooking("confirmed", { refundedKind: "booking", otherLiveBookingPayments: 0, keepBooking: false }),
    true,
  );
});
