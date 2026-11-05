import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Toda escrita de JSON-LD passa por `serializarJsonLd`. O build escreve o script colando o
 * conteúdo entre as tags sem escape, e `JSON.stringify` direto deixava um `</script>` gravado pelo
 * parceiro (nome da unidade, endereço, FAQ) fechar o script no HTML publicado. Ver
 * `jsonld-seguro.ts`.
 */
const RAIZ = join(__dirname, "..");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

describe("JSON-LD sempre serializado com escape", () => {
  const blocos = arquivos(RAIZ).flatMap((arquivo) => {
    const fonte = readFileSync(arquivo, "utf8");
    return [...fonte.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
      (m) => ({ arquivo: relative(RAIZ, arquivo), conteudo: m[1] }),
    );
  });

  it("encontra os scripts de JSON-LD (a guarda não está olhando para o lugar errado)", () => {
    expect(blocos.length).toBeGreaterThan(40);
  });

  it("nenhum script de JSON-LD usa JSON.stringify direto", () => {
    const crus = blocos
      .filter(
        (b) => b.conteudo.includes("JSON.stringify(") && !b.arquivo.endsWith("jsonld-seguro.ts"),
      )
      .map((b) => b.arquivo);
    expect(crus).toEqual([]);
  });

  it("nenhum script de JSON-LD usa dangerouslySetInnerHTML", () => {
    const fontes = arquivos(RAIZ).filter((a) =>
      /application\/ld\+json"[^>]*dangerouslySetInnerHTML/.test(readFileSync(a, "utf8")),
    );
    expect(fontes.map((a) => relative(RAIZ, a))).toEqual([]);
  });
});
