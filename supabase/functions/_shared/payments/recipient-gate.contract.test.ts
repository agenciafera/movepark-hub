// Contrato: quem trava a venda por `recipient.status` tem que SELECIONAR `status`.
//
// O que aconteceu (23/09 a 04/10/2026): a trava "recebedor ativo no gateway" ganhou a condição
// `recipient.status !== "active"` nas duas Edges de cobrança, mas só o PIX passou a pedir a coluna
// no select. No cartão `status` chegava `undefined`, `undefined !== "active"` é sempre verdadeiro, e
// TODA cobrança de cartão de empresa com split caía em 409 "O estacionamento ainda não tem
// recebedor ativo no gateway". Foram 14 tentativas de 6 clientes em 02 e 03/10 (Abbapark e
// Nationpark, as primeiras empresas com split), nenhuma chegou ao gateway, e o rastro do gateway
// ficou vazio porque a Edge recusava antes de chamar a Pagar.me.
//
// O guarda é textual, como o de `custodia.contract.test.ts`: subir a Edge contra um banco só para
// isso não vale; o que se quer é que a coluna comparada esteja no select, em toda Edge.

import { assert, assertEquals } from "jsr:@std/assert";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);
const TRAVA = /recipient\??\.status !== "active"/;
const SELECT = /\.from\("payout_recipient"\)\s*\.select\("([^"]*)"\)/g;

async function edgeIndexFiles(): Promise<{ name: string; src: string }[]> {
  const out: { name: string; src: string }[] = [];
  for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
    if (!entry.isDirectory || entry.name.startsWith("_")) continue;
    try {
      const src = await Deno.readTextFile(new URL(`${entry.name}/index.ts`, FUNCTIONS_DIR));
      out.push({ name: entry.name, src });
    } catch {
      // pasta sem index.ts
    }
  }
  return out;
}

Deno.test("toda Edge que trava por recipient.status seleciona a coluna status do payout_recipient", async () => {
  const edges = (await edgeIndexFiles()).filter((e) => TRAVA.test(e.src));
  // Guarda contra teste vácuo: as duas Edges de cobrança têm a trava.
  assert(edges.some((e) => e.name === "create-card-charge"), "create-card-charge tem a trava");
  assert(edges.some((e) => e.name === "create-pix-charge"), "create-pix-charge tem a trava");

  const semStatus: string[] = [];
  for (const e of edges) {
    const selects = [...e.src.matchAll(SELECT)].map((m) => m[1]);
    assert(selects.length > 0, `${e.name}: trava por status mas não lê payout_recipient`);
    for (const cols of selects) {
      const lista = cols.split(",").map((c) => c.trim());
      if (!lista.includes("status")) semStatus.push(`${e.name}: select("${cols}")`);
    }
  }
  assertEquals(semStatus, [], "select do recebedor sem a coluna status que a trava compara");
});
