// Contrato: o cancelamento estorna o pagamento que sustenta a reserva, não "o último".
//
// Com o estorno avulso (19/10/2026) a reserva pode ter um pagamento estornado mais novo que o que
// vale: na MP-07DAE9 a cópia da cobrança em dobro é a mais nova. Pegar só o último fazia o
// cancelamento achar que já tinha devolvido tudo e não estornar o pagamento que valia.

import { assert } from "jsr:@std/assert";

Deno.test("cancel-booking: procura primeiro o pagamento da reserva ainda pago e com valor a devolver", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const busca = src.split("const { data: candidatos }")[1]?.split(";")[0] ?? "";
  assert(busca.includes('.eq("kind", "booking")'), "filtra o pagamento da reserva");
  assert(busca.includes('.in("status", ["paid", "authorized"])'), "só pagamento aprovado");
  // 17/11/2026: a cópia estornada inteira fica de fora, mas a cobrança com estorno PARCIAL de uma
  // troca de datas continua sustentando a reserva e devolve o resto.
  assert(src.includes("remainingCents(p.amount, p.refunded_amount) > 0"), "ignora o que já foi devolvido por inteiro");
  assert(src.includes("const { data: payment } = vivo"), "o vivo vem antes do último");
});

Deno.test("cancel-booking: devolve o resto da cobrança e as cobranças extras (diferença de datas, upgrade)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes("amountCents: restanteCents"), "estorna só o que sobrou da cobrança da reserva");
  assert(src.includes('.in("kind", ["date_change", "fare_upgrade"])'), "procura as cobranças extras");
});
