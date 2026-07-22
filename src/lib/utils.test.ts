import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cn, FONT_SIZE_TOKENS } from "./utils";

describe("cn", () => {
  it("junta classes", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("ignora falsy (clsx)", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });
  it("resolve conflito de Tailwind mantendo o último (twMerge)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm text-red-500", "text-lg")).toBe("text-red-500 text-lg");
  });
});

/**
 * Regressão do bug que apagava o tamanho de fonte de todo Badge do app.
 *
 * `text-badge-confirmed-fg` é COR e `text-badge` é TAMANHO. Sem os degraus do
 * projeto declarados no twMerge, os dois caíam no mesmo grupo e o merge
 * descartava o token de tamanho sem avisar ninguém.
 */
describe("cn com os degraus de tipografia do projeto", () => {
  it("não deixa uma cor de badge apagar o tamanho do texto", () => {
    expect(cn("text-caption", "text-badge-confirmed-fg")).toBe(
      "text-caption text-badge-confirmed-fg",
    );
    expect(cn("text-badge", "text-badge-pending-fg")).toBe("text-badge text-badge-pending-fg");
  });

  it("não deixa uma cor qualquer apagar o tamanho do texto", () => {
    expect(cn("text-title-md", "text-muted")).toBe("text-title-md text-muted");
    expect(cn("text-display-sm", "text-ink")).toBe("text-display-sm text-ink");
  });

  it("ainda resolve conflito real entre dois tamanhos do projeto", () => {
    expect(cn("text-caption", "text-badge")).toBe("text-badge");
    expect(cn("text-title-md", "text-display-sm")).toBe("text-display-sm");
  });

  it("a lista de degraus está em lockstep com o tailwind.config.ts", () => {
    const config = readFileSync(join(process.cwd(), "tailwind.config.ts"), "utf8");
    const block = config.match(/fontSize:\s*\{([\s\S]*?)\n {6}\},/)?.[1];
    expect(block, "não achei o bloco fontSize no tailwind.config.ts").toBeTruthy();

    const noComments = block!.replace(/\/\/.*$/gm, "");
    const keysNoConfig = [...noComments.matchAll(/^\s{8}"?([a-z0-9-]+)"?:\s*\[/gm)].map(
      (m) => m[1],
    );

    expect(keysNoConfig.length).toBeGreaterThan(0);
    expect([...FONT_SIZE_TOKENS].sort()).toEqual(keysNoConfig.sort());
  });
});
