// Contrato: no ramo `transfer.*`, o webhook procura o REPASSE antes do SAQUE.
//
// `POST /transfers` faz as duas coisas e os dois eventos chegam como `transfer.*`. Se o handler
// olhar `payout_withdrawal` primeiro, todo repasse que a Movepark fizer vira uma linha falsa de
// saque na tela do parceiro, inflando o "já transferido" com dinheiro que ele ainda não tirou.
//
// Guarda textual de propósito: testar de verdade exigiria subir a Edge contra um banco, e o que se
// quer aqui é travar a ORDEM, que é o detalhe fácil de inverter numa refatoração.

import { assert } from "jsr:@std/assert";

Deno.test("ramo transfer.* consulta payout_transfer antes de payout_withdrawal", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

  const inicioRamo = src.indexOf('ev.type.startsWith("transfer.")');
  assert(inicioRamo > 0, "ramo transfer.* não encontrado: o handler mudou de forma");

  const ramo = src.slice(inicioRamo);
  const posRepasse = ramo.indexOf('from("payout_transfer")');
  const posSaque = ramo.indexOf('from("payout_withdrawal")');

  assert(posRepasse >= 0, "o ramo transfer.* não consulta payout_transfer");
  assert(posSaque >= 0, "o ramo transfer.* não consulta payout_withdrawal");
  assert(
    posRepasse < posSaque,
    "payout_withdrawal é consultado ANTES de payout_transfer: todo repasse vira saque falso na " +
      "tela do parceiro",
  );
});
