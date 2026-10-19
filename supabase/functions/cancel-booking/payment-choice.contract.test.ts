// Contrato: o cancelamento estorna o pagamento que sustenta a reserva, não "o último".
//
// Com o estorno avulso (19/10/2026) a reserva pode ter um pagamento estornado mais novo que o que
// vale: na MP-07DAE9 a cópia da cobrança em dobro é a mais nova. Pegar só o último fazia o
// cancelamento achar que já tinha devolvido tudo e não estornar o pagamento que valia.

import { assert } from "jsr:@std/assert";

Deno.test("cancel-booking: procura primeiro o pagamento da reserva ainda pago e sem estorno", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const vivo = src.split("const { data: vivo }")[1]?.split(";")[0] ?? "";
  assert(vivo.includes('.eq("kind", "booking")'), "filtra o pagamento da reserva");
  assert(vivo.includes('.in("status", ["paid", "authorized"])'), "só pagamento aprovado");
  assert(vivo.includes('.is("refunded_at", null)'), "ignora o que já foi estornado");
  assert(src.includes("const { data: payment } = vivo"), "o vivo vem antes do último");
});
