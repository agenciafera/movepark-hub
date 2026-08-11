import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Fragmento dentro de `<Helmet>` some da página, sem avisar.
 *
 * O `react-helmet-async` só lê os filhos **diretos** do `<Helmet>`. Um bloco
 * agrupado num fragmento (`<>…</>`) é descartado inteiro: o build passa, o
 * typecheck passa, o teste de unidade passa, e a meta simplesmente não existe
 * no HTML servido.
 *
 * Aconteceu de verdade em 11/08/2026: as quatro metas de `og:image` do post
 * foram agrupadas num fragmento condicional e sumiram dos 94 posts em produção.
 * Foi preciso ir olhar o HTML no ar para descobrir.
 *
 * A regra aqui é de fonte, e não de render, porque assim ela vale para toda
 * rota de uma vez, inclusive as que ninguém lembrou de cobrir. Meta condicional
 * se escreve solta: `{x && <meta … />}`, uma por linha.
 */

function arquivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTsx(caminho);
    return nome.endsWith(".tsx") ? [caminho] : [];
  });
}

/** Trechos entre `<Helmet` e o `</Helmet>` correspondente. */
function blocosHelmet(fonte: string): string[] {
  const blocos: string[] = [];
  let i = fonte.indexOf("<Helmet");
  while (i !== -1) {
    const fim = fonte.indexOf("</Helmet>", i);
    if (fim === -1) break;
    blocos.push(fonte.slice(i, fim));
    i = fonte.indexOf("<Helmet", fim);
  }
  return blocos;
}

describe("nenhum fragmento dentro de Helmet", () => {
  const raiz = join(process.cwd(), "src");
  const arquivos = arquivosTsx(raiz);

  it("varre um conjunto de arquivos não vazio", () => {
    expect(arquivos.length).toBeGreaterThan(20);
  });

  it("encontra os Helmet que existem hoje", () => {
    const comHelmet = arquivos.filter((a) => blocosHelmet(readFileSync(a, "utf8")).length > 0);
    expect(comHelmet.length).toBeGreaterThan(0);
  });

  it("nenhuma rota agrupa metas num fragmento", () => {
    const culpados = arquivos.flatMap((a) => {
      const blocos = blocosHelmet(readFileSync(a, "utf8"));
      // `<>` abrindo fragmento. O `</>` de fechamento vem junto, então basta um.
      return blocos.some((b) => /<>\s/.test(b) || /\s<>/.test(b))
        ? [a.replace(`${process.cwd()}/`, "")]
        : [];
    });
    expect(culpados).toEqual([]);
  });
});
