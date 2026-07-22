import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda o contrato de layout do shell administrativo (manager + operator).
 *
 * É varredura de fonte, e não render, pelo mesmo motivo do contrato de
 * tipografia: Tailwind aceita qualquer string, então esse drift atravessa
 * typecheck, lint e CI sem uma queixa. As duas regras abaixo já foram violadas
 * de verdade e voltariam sozinhas na próxima edição distraída.
 */

const SHARED = join(process.cwd(), "src", "components", "shared");
const read = (file: string) => readFileSync(join(SHARED, file), "utf8");

/** Os arquivos que compõem o shell dos dois painéis. */
const SHELL = ["AppShell.tsx", "Sidebar.tsx", "Topbar.tsx", "PageHeader.tsx"];

/** Tira comentários de linha e de bloco: o texto que explica a regra não é a regra. */
function semComentarios(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("contrato de layout do shell administrativo", () => {
  it("nenhuma sombra em repouso: shadow-tier só com hover", () => {
    // DESIGN.md: "plano por padrão... a sombra aparece em cards interativos no
    // hover". O Card, o item ativo do sidebar e a busca do topbar carregavam
    // sombra parada, o que dava afordância de clicável a coisa que não clica e
    // não deixava nada sobrando pro hover.
    const offenders = SHELL.flatMap((file) => {
      const body = semComentarios(read(file));
      return [...body.matchAll(/(\S*)shadow-tier/g)]
        .filter((m) => !/(hover|group-hover|focus|focus-visible):$/.test(m[1]))
        .map(() => file);
    });

    expect([...new Set(offenders)]).toEqual([]);
  });

  it("nenhuma tarja lateral colorida como acento", () => {
    // Ban absoluto do design system. O item ativo do sidebar usava
    // `before:w-[2px] before:bg-mp-navy` na borda esquerda, e ainda por cima
    // redundante: fundo, peso e cor do texto já marcavam o ativo.
    const offenders = SHELL.filter((file) => {
      const body = semComentarios(read(file));
      return /before:w-\[[2-9]\d*px\].*before:bg-|border-[lr]-[2-9]/.test(body);
    });

    expect(offenders).toEqual([]);
  });

  it("o cabeçalho de página é uma zona, não mais um bloco na fila", () => {
    // As páginas empilham com `gap-6` (24px). Sem respiro próprio, o header
    // ficava a 24px do corpo, a mesma distância que os blocos guardam entre si,
    // e nada agrupava nada. O `pb-4` faz 40px depois do header contra 24px
    // entre blocos.
    const body = read("PageHeader.tsx");

    expect(body).toMatch(/!isContent && "pb-4"/);
  });
});
