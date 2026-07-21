import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOW_IT_WORKS } from "./copy";

/**
 * A home e a /sobre explicavam o mesmo fluxo com textos diferentes (4 passos contra 3,
 * "Simples e rápido" contra "Como funciona"), porque cada uma tinha a própria lista.
 * Este teste é uma varredura de fonte: ele falha se alguém voltar a escrever a copy
 * dentro de uma das páginas em vez de ler daqui.
 */
const SUPERFICIES = [
  join(process.cwd(), "src", "features", "home", "HowItWorks.tsx"),
  join(process.cwd(), "src", "routes", "sobre.tsx"),
];

describe("contrato do 'como funciona'", () => {
  it("as duas superfícies leem da fonte única", () => {
    for (const arquivo of SUPERFICIES) {
      const body = readFileSync(arquivo, "utf8");
      expect(body, `${arquivo} deveria importar HOW_IT_WORKS`).toContain(
        'from "@/features/how-it-works/copy"',
      );
    }
  });

  it("nenhuma superfície declara a própria lista de passos", () => {
    const infratores = SUPERFICIES.filter((arquivo) =>
      /const (steps|STEPS)\s*=\s*\[/.test(readFileSync(arquivo, "utf8")),
    );

    expect(infratores).toEqual([]);
  });

  it("nenhuma superfície repete a copy antiga", () => {
    const antigas = ["Simples e rápido", "quatro passos", "Compare as opções"];
    const infratores = SUPERFICIES.flatMap((arquivo) => {
      const body = readFileSync(arquivo, "utf8");
      return antigas.filter((t) => body.includes(t)).map((t) => `${arquivo}: ${t}`);
    });

    expect(infratores).toEqual([]);
  });

  it("são 3 passos, e a headline promete esse número", () => {
    expect(HOW_IT_WORKS.steps).toHaveLength(3);
    expect(HOW_IT_WORKS.headline).toContain("Três passos");
  });

  it("não promete traslado, que não vale pra metade das unidades", () => {
    // 16 de 28 unidades vendáveis têm `shuttle_free`, e 12 nem ficam em aeroporto
    // (centro de SP, Jardim Paulista, Nova Iguaçu, Tietê). Conferido no banco em
    // 21/07/2026. A promessa de traslado só cabe na página da unidade que tem.
    const texto = HOW_IT_WORKS.steps.map((s) => s.text).join(" ").toLowerCase();
    expect(texto).not.toContain("traslado");
    expect(texto).not.toContain("terminal");
  });
});
