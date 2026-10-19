// Contrato: no create-card-charge, toda recusa depois de achar a reserva deixa rastro.
//
// De 23/09 a 05/10/2026 o cartão ficou quebrado e ninguém viu: 14 tentativas morreram em 409 na
// trava de recebedor e não deixaram linha em `payment_gateway_event`, só no log da Edge. Agora as
// recusas passam por `recusar()`, que grava `charge_rejected` na reserva. As únicas exceções são as
// quatro respostas da recusa do gateway, que já gravaram `charge_failed` logo antes: dado do cartão
// recusado (CVV, validade, nome; desde 19/10/2026), erro de integração, antifraude e emissor.

import { assertEquals } from "jsr:@std/assert";

Deno.test("create-card-charge: recusa depois da reserva passa por recusar()", async () => {
  const src = await Deno.readTextFile(new URL("../../create-card-charge/index.ts", import.meta.url));
  const depois = src.split("const recusar = async")[1] ?? "";
  const semRastro = depois.match(/return jsonResponse\(\s*\{\s*error/g) ?? [];
  assertEquals(
    semRastro.length,
    4,
    "apareceu recusa nova sem rastro: use `return await recusar(status, mensagem)`",
  );
});
