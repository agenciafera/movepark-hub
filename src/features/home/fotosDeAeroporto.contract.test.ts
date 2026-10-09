import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cada destino tem a própria foto.
 *
 * Em 09/10/2026 o card do Afonso Pena (CWB) aparecia na home com a foto do
 * Galeão: `CWB.webp` era cópia byte a byte de `GIG.webp`, com o Pão de Açúcar ao
 * fundo, e o carrossel mostrava Curitiba e Rio com a mesma imagem lado a lado.
 * Nome de arquivo certo não garante foto certa, então o teste compara o conteúdo.
 */

const PASTA = join(process.cwd(), "public/airports");

describe("fotos de aeroporto", () => {
  it("não repete a mesma imagem em dois destinos", () => {
    const porHash = new Map<string, string[]>();
    for (const arquivo of readdirSync(PASTA).filter((f) => f.endsWith(".webp"))) {
      const hash = createHash("sha256")
        .update(readFileSync(join(PASTA, arquivo)))
        .digest("hex");
      porHash.set(hash, [...(porHash.get(hash) ?? []), arquivo]);
    }
    const repetidas = [...porHash.values()].filter((arquivos) => arquivos.length > 1);
    expect(repetidas).toEqual([]);
  });
});
