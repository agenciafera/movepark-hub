import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Botão sobre fundo colorido tem uma variante, e não uma receita copiada.
 *
 * Até 18/08/2026 o "só borda" sobre violeta e navy existia em três lugares, cada
 * um escrito à mão como `variant="secondary"` mais quatro classes, duas delas só
 * para desligar o que o secondary trazia. Cada cópia tinha a sua opacidade de
 * borda, e a faixa do rodapé nem chegou a ganhar uma: saiu com botão branco
 * cheio, que virava a coisa mais clara da faixa.
 *
 * A regra: sobre cor, use `variant="outlineInverse"`. Quem precisar de outro
 * desenho muda a variante, e a mudança chega nas três telas de uma vez.
 */

const RAIZ = process.cwd();

function fontesDeUi(): string[] {
  const saida = execSync("git ls-files 'src/**/*.tsx'", { cwd: RAIZ, encoding: "utf8" });
  return saida
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes(".test.") && !f.endsWith("src/components/ui/button.tsx"));
}

/** Um `<Button …>` inteiro, com as quebras de linha que o Prettier põe. */
const BOTAO = /<Button\b[\s\S]*?>/g;

describe("botão sobre fundo colorido", () => {
  it("ninguém remonta o outline à mão: sobre cor a variante é outlineInverse", () => {
    const infratores: string[] = [];

    for (const arquivo of fontesDeUi()) {
      const fonte = readFileSync(`${RAIZ}/${arquivo}`, "utf8");
      for (const [botao] of fonte.matchAll(BOTAO)) {
        if (botao.includes("outlineInverse")) continue;
        const semFundo = /bg-transparent/.test(botao);
        const bordaClara = /border-white/.test(botao);
        if (semFundo && bordaClara) {
          infratores.push(`${arquivo}: ${botao.replace(/\s+/g, " ").slice(0, 100)}`);
        }
      }
    }

    expect(infratores).toEqual([]);
  });
});
