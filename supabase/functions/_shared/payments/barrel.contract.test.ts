// Contrato do barrel `_shared/payments/index.ts`.
//
// Por que este teste existe: o index faz reexport NOMEADO (`export { buildSplit } from "./split.ts"`),
// não `export *`. Importar dele um símbolo que não está na lista não falha no typecheck (as Edges
// ficam fora do tsc) nem nos testes que importam o módulo direto. Falha no BOOT do worker, com 503
// em qualquer request, inclusive OPTIONS. Foi assim que o checkout PIX caiu em 31/07/2026: a Edge
// passou a importar `isGatewaySplitEnabled` do barrel sem que ele estivesse reexportado.
//
// Este teste varre o que as Edge Functions realmente importam do barrel e confere símbolo por
// símbolo. Vale para qualquer export novo, não só para o que quebrou.

import { assert } from "jsr:@std/assert";
import * as barrel from "./index.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

/** Imports de VALOR do barrel (ignora `import type`, que some na compilação). */
const IMPORT_RE =
  /import\s+(?!type\s)\{([^}]*)\}\s*from\s*["'][^"']*_shared\/payments\/index\.ts["']/g;

async function collectTsFiles(dir: URL): Promise<URL[]> {
  const out: URL[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) out.push(...(await collectTsFiles(child)));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(child);
  }
  return out;
}

Deno.test("barrel de payments exporta tudo que as Edge Functions importam dele", async () => {
  const files = await collectTsFiles(FUNCTIONS_DIR);
  const usados = new Map<string, string[]>(); // símbolo → arquivos que o importam

  for (const file of files) {
    const src = await Deno.readTextFile(file);
    for (const m of src.matchAll(IMPORT_RE)) {
      for (const raw of m[1].split(",")) {
        const nome = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
        if (!nome) continue;
        const lista = usados.get(nome) ?? [];
        lista.push(file.pathname.split("/functions/")[1] ?? file.pathname);
        usados.set(nome, lista);
      }
    }
  }

  assert(usados.size > 0, "nenhum import do barrel encontrado: o regex ou o caminho quebrou");

  const faltando: string[] = [];
  for (const [nome, arquivos] of usados) {
    if (!(nome in barrel)) faltando.push(`${nome} (usado em ${arquivos.join(", ")})`);
  }

  assert(
    faltando.length === 0,
    "símbolos importados do barrel mas NÃO reexportados por index.ts, o que derruba o boot da " +
      `Edge com 503:\n  ${faltando.join("\n  ")}`,
  );
});

Deno.test("barrel expõe o interruptor de split e o montador", () => {
  // Guard direto do caso que quebrou, para a mensagem de falha ser óbvia.
  assert(typeof barrel.buildSplit === "function");
  assert(typeof barrel.isGatewaySplitEnabled === "function");
});
