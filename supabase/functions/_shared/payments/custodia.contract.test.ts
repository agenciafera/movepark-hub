// Contrato: toda Edge que cobra grava `split_sent_to_gateway` no `payment`.
//
// Esse booleano é o que responde "quando esta venda aconteceu, o gateway creditou o parceiro?", e é
// dele que sai quanto a Movepark deve (`payout_owed_cents`). Uma Edge de cobrança nova que esqueça
// de gravá-lo grava NULL, NULL é tratado como enviado, e a dívida daquela venda some em silêncio.
// Ninguém percebe: o extrato fecha, o teste passa, e o parceiro simplesmente não recebe.
//
// O guarda é textual de propósito. Testar isso de verdade exigiria subir a Edge contra um banco, e
// o que se quer aqui é só a garantia de que a linha existe no arquivo.

import { assert } from "jsr:@std/assert";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

/** Uma Edge "cobra" quando decide o modo de split pela chave (`isGatewaySplitEnabled`). */
const MARCA_DE_COBRANCA = "isGatewaySplitEnabled";
const COLUNA = "split_sent_to_gateway";

async function edgeIndexFiles(): Promise<URL[]> {
  const out: URL[] = [];
  for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
    if (!entry.isDirectory || entry.name.startsWith("_")) continue;
    const index = new URL(`${entry.name}/index.ts`, FUNCTIONS_DIR);
    try {
      await Deno.stat(index);
      out.push(index);
    } catch {
      // pasta sem index.ts (não é Edge)
    }
  }
  return out;
}

Deno.test("toda Edge que cobra grava split_sent_to_gateway no payment", async () => {
  const arquivos = await edgeIndexFiles();
  assert(arquivos.length > 0, "nenhuma Edge encontrada: o caminho quebrou");

  const cobram: string[] = [];
  const faltando: string[] = [];
  for (const file of arquivos) {
    const src = await Deno.readTextFile(file);
    if (!src.includes(MARCA_DE_COBRANCA)) continue;
    const nome = file.pathname.split("/functions/")[1] ?? file.pathname;
    cobram.push(nome);
    if (!src.includes(COLUNA)) faltando.push(nome);
  }

  assert(
    cobram.length >= 4,
    `esperava pelo menos as 4 Edges de cobrança, achei ${cobram.length}: ${cobram.join(", ")}`,
  );
  assert(
    faltando.length === 0,
    "Edge que cobra sem gravar `split_sent_to_gateway`: a dívida com o parceiro some em silêncio " +
      `naquelas vendas.\n  ${faltando.join("\n  ")}`,
  );
});
