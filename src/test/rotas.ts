import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES_TSX = join(process.cwd(), "src", "routes.tsx");

/**
 * Resolve os `path:` de `src/routes.tsx` como texto. Importar a árvore puxaria as
 * ~90 páginas para dentro do teste, com providers e fetch no loader.
 *
 * Filha é relativa ao pai, e o pai sempre aparece antes dela no arquivo, então o
 * último path absoluto visto é o prefixo.
 */
export function rotasDeclaradas(): string[] {
  const source = readFileSync(ROUTES_TSX, "utf8");
  let base = "";
  const rotas: string[] = [];
  for (const m of source.matchAll(/path:\s*"([^"]*)"/g)) {
    const p = m[1];
    if (p.startsWith("/")) {
      base = p;
      rotas.push(p);
    } else if (p === "*") {
      rotas.push("*");
    } else {
      rotas.push((base === "/" ? "" : base) + "/" + p);
    }
  }
  return [...new Set(rotas)];
}
