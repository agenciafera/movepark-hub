import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { MIN_AVALIACOES_PARA_NOTA } from "@/lib/reviews-volume.mjs";

/**
 * O piso de volume da nota tem que valer igual nos três runtimes.
 *
 * O front (Vite/TS), os scripts de build (node puro, que não lê TS) e o Deno das Edge
 * Functions não conseguem importar um do outro, então o número mora em dois arquivos e este
 * teste solda os dois, do mesmo jeito que `site.contract.test.ts` faz com o host canônico.
 *
 * O risco que ele cobre não é teórico: se a busca ordenasse por um piso diferente do que a
 * tela publica, o primeiro resultado apareceria sem nota, e ninguém entenderia por quê.
 *
 * Ver docs/specs/reviews.md.
 */

const RAIZ = process.cwd();
const ler = (f: string) => readFileSync(`${RAIZ}/${f}`, "utf8");

function valorDeclarado(arquivo: string): number {
  const m = /MIN_AVALIACOES_PARA_NOTA\s*=\s*(\d+)/.exec(ler(arquivo));
  expect(m, `${arquivo} precisa declarar MIN_AVALIACOES_PARA_NOTA`).not.toBeNull();
  return Number(m![1]);
}

describe("piso de volume da nota", () => {
  it("o Deno das Edges usa o mesmo número do front", () => {
    expect(valorDeclarado("supabase/functions/_shared/reviews.ts")).toBe(MIN_AVALIACOES_PARA_NOTA);
    expect(valorDeclarado("src/lib/reviews-volume.mjs")).toBe(MIN_AVALIACOES_PARA_NOTA);
  });

  /**
   * O piso só vale se ninguém comparar `review_count` na mão por aí. Quem precisar de uma
   * regra diferente muda o helper, e aí o número muda em todo lugar de uma vez.
   */
  it("nenhum arquivo de produção compara review_count com número solto", () => {
    const arquivos = execSync(
      "git ls-files 'src' 'supabase/functions' 'scripts' | grep -E '\\.(ts|tsx|mjs)$'",
      { cwd: RAIZ, encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((f) => !/\.test\.|\/test\/|reviews-volume\.mjs|_shared\/reviews\.ts/.test(f));

    const infratores = arquivos.filter((f) =>
      /review_count\s*(?:\?\?\s*0\s*)?[<>]=?\s*\d/.test(
        ler(f)
          .split("\n")
          .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
          .join("\n"),
      ),
    );

    expect(infratores).toEqual([]);
  });
});
