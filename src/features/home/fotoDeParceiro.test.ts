import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Foto de parceiro fora da ficha da própria unidade.
 *
 * A regra ficou combinada na reunião de 13/08: foto do lote na single da
 * unidade é legítima, porque descreve aquele lugar. A mesma foto usada como
 * ilustração institucional põe a marca de um parceiro para explicar a Movepark
 * sem que ele tenha topado, e sobrou justo num parceiro que o time decidiu não
 * envolver agora.
 *
 * As fotos de lote importadas do legado moram em `public/Estacionamentos/`. As
 * fotos das unidades de verdade não vêm daí: vêm do storage do Supabase, por
 * `location.photos`. Então qualquer caminho literal para essa pasta no código é
 * uso institucional, e é isso que o teste procura.
 */
const PASTA_DE_FOTOS_DE_PARCEIRO = "/Estacionamentos/";

/** Onde a home e as páginas institucionais moram. */
const SUPERFICIES = ["src/features/home", "src/features/content", "src/routes"];

function arquivosDe(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      saida.push(...arquivosDe(caminho));
      continue;
    }
    if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

describe("foto de parceiro fora da ficha da unidade", () => {
  it("nenhuma superfície institucional aponta para public/Estacionamentos/", () => {
    const culpados = SUPERFICIES.flatMap(arquivosDe).filter((caminho) =>
      readFileSync(caminho, "utf-8").includes(PASTA_DE_FOTOS_DE_PARCEIRO),
    );

    expect(culpados).toEqual([]);
  });

  /** Se o guarda acima nunca varrer nada, ele passa por vazio e não guarda nada. */
  it("o guarda está de fato lendo arquivos", () => {
    expect(SUPERFICIES.flatMap(arquivosDe).length).toBeGreaterThan(20);
  });
});
