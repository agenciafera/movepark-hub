import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A coluna que segura a trilha de avaliações tem que declarar `min-w-0`.
 *
 * Nenhum teste de componente alcança isto: happy-dom não tem motor de layout, então a
 * regressão só aparece no navegador, e aparece longe de onde nasceu. Foi o que aconteceu
 * quando as avaliações do Google viraram trilha horizontal: `1fr` é `minmax(auto, 1fr)`, a
 * coluna não encolheu abaixo do min-content da trilha e foi de 768px para 1.001px em 1440px
 * de janela. Os 233px saíram do card de reserva, que foi parar fora da tela com o check-in
 * cortado, e a página inteira ganhou barra horizontal.
 *
 * O guard é de fonte porque a causa é de fonte: o `overflow-x-auto` da trilha não segura
 * nada (o min-content atravessa os blocos até o item da grade), então quem tira o `min-w-0`
 * daqui reabre o buraco para qualquer conteúdo largo que entre na coluna.
 *
 * Ver docs/specs/avaliacoes-google.md §6.
 */
describe("grade de 2 colunas da ficha", () => {
  it("a coluna da trilha encolhe, senao empurra o card de reserva para fora da tela", () => {
    const linhas = readFileSync(`${process.cwd()}/src/routes/listing.tsx`, "utf8").split("\n");

    const iTrilha = linhas.findIndex((l) => l.includes("<GoogleReviewsBlock"));
    expect(iTrilha, "a ficha precisa renderizar o bloco do Google").toBeGreaterThan(-1);

    const iGrade = linhas
      .slice(0, iTrilha)
      .reduce((ultima, l, i) => (l.includes("grid-cols-[1fr_400px]") ? i : ultima), -1);
    expect(iGrade, "o bloco precisa estar dentro da grade de 2 colunas").toBeGreaterThan(-1);

    const coluna = linhas
      .slice(iGrade + 1, iTrilha)
      .find((l) => /<div className="/.test(l) && !l.trim().startsWith("{/*"));
    expect(coluna, "a grade precisa abrir a coluna antes do bloco").toBeDefined();
    expect(coluna).toContain("min-w-0");
  });
});
