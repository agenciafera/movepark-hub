import { assertEquals } from "jsr:@std/assert";
import { refundShouldCancelBooking } from "./refund.ts";

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
