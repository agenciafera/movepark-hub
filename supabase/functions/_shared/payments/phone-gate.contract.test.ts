// Contrato: toda Edge de cobrança manda o telefone do pagador ao gateway.
//
// O Pagar.me recusa pedido de cartão sem telefone com 412 "At least one customer phone is
// required" (medido na MP-200728, 05/10/2026: duas tentativas de cartão caíram, o cliente só pagou
// por PIX). O PIX já exigia e enviava o telefone desde o início; o cartão nunca selecionou
// `customer_phone` nem o passou ao `createCardCharge`. O guarda é textual, como o de
// `recipient-gate.contract.test.ts`: cada Edge que cria cobrança tem que selecionar
// `customer_phone` e montar o telefone com `parseBrPhone(booking.customer_phone)`.

import { assert } from "jsr:@std/assert";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);
const EDGES_DE_COBRANCA = ["create-pix-charge", "create-card-charge"];

Deno.test("as Edges de cobrança selecionam customer_phone e mandam o telefone ao gateway", async () => {
  for (const name of EDGES_DE_COBRANCA) {
    const src = await Deno.readTextFile(new URL(`${name}/index.ts`, FUNCTIONS_DIR));
    assert(/customer_phone/.test(src), `${name}: não seleciona customer_phone do booking`);
    assert(/parseBrPhone\(booking\.customer_phone\)/.test(src), `${name}: não monta o telefone com parseBrPhone`);
    assert(/^\s+phone,\s*$/m.test(src), `${name}: não passa phone no customer da cobrança`);
  }
});
