import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Viúva é palavra sozinha na última linha, e é erro de diagramação.
 *
 * Apareceu em 17/08/2026 na /como-funciona ("minutos" sozinho) e na
 * /cancelamento, e a causa não foi o texto: foi um `max-w-[26ch]` no h1, um teto
 * escolhido a olho que cortava o título antes da largura real da página. Cada
 * página tinha o seu, então a mesma frase quebrava em lugar diferente conforme a
 * rota.
 *
 * A regra: quem decide a quebra é o navegador, com `text-balance` no título e
 * `text-pretty` no texto corrido. Teto em `ch` continua valendo para medida de
 * leitura em parágrafo, nunca em heading.
 */

const RAIZ = process.cwd();

/** Arquivos de UI do consumer, sem teste nem gerado. */
function fontesDoConsumer(): string[] {
  const saida = execSync(
    "git ls-files 'src/routes/*.tsx' 'src/features/**/*.tsx' 'src/components/shared/*.tsx'",
    { cwd: RAIZ, encoding: "utf8" },
  );
  return saida
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes(".test.") && !f.includes("design-system"));
}

/** Um `className` por elemento, para achar teto e token de heading juntos. */
function classNames(fonte: string): string[] {
  return [...fonte.matchAll(/className=(?:"([^"]*)"|\{cn\(([^)]*)\))/g)].map(
    (m) => m[1] ?? m[2] ?? "",
  );
}

const TOKEN_DE_HEADING = /text-(display|title)-[a-z0-9]+/;
const TETO_EM_CH = /max-w-\[\d+ch\]/;

describe("quebra de linha", () => {
  it("nenhum heading tem teto em ch, que é o que fabrica a viúva", () => {
    const infratores: string[] = [];

    for (const arquivo of fontesDoConsumer()) {
      const fonte = readFileSync(`${RAIZ}/${arquivo}`, "utf8");
      for (const classe of classNames(fonte)) {
        if (TOKEN_DE_HEADING.test(classe) && TETO_EM_CH.test(classe)) {
          infratores.push(`${arquivo}: ${classe.trim().slice(0, 90)}`);
        }
      }
    }

    expect(infratores).toEqual([]);
  });

  /** As três aberturas de página do consumer, que é onde o título é grande. */
  it("o título das aberturas de página deixa o navegador equilibrar as linhas", () => {
    const aberturas = [
      "src/components/shared/PageHero.tsx",
      "src/components/shared/PageHeader.tsx",
      "src/features/content/ContentPageView.tsx",
    ];

    for (const arquivo of aberturas) {
      const fonte = readFileSync(`${RAIZ}/${arquivo}`, "utf8");
      const h1 = fonte.slice(fonte.indexOf("<h1"), fonte.indexOf("</h1>"));
      expect(h1, `${arquivo}: o h1 precisa de text-balance`).toContain("text-balance");
    }
  });
});
