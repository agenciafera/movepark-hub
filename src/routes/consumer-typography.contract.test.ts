import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda o contrato de tipografia das páginas do consumer (skill `harmonizar-paginas`).
 *
 * É uma varredura de fonte, não um render: o drift que este teste pega (h1 com o tier
 * errado, classe de token que não existe) passa por typecheck, lint e CI sem reclamar,
 * porque Tailwind aceita qualquer string. Foi assim que `text-body-lg`, que nunca
 * existiu no config, ficou em produção em três páginas.
 */

// `import.meta.url` aqui vem como http (o vitest serve os módulos), então não dá
// para derivar o caminho dele. O runner roda na raiz do projeto.
const SRC = join(process.cwd(), "src");

/** A vitrine do design system mostra todos os tiers de propósito, inclusive os restritos. */
const SHOWCASE = "design-system.tsx";

/**
 * A superfície do consumer: as rotas na raiz de `src/routes` (manager, operator e
 * account moram em subpastas e têm shell próprio) mais as features que só elas usam.
 */
const CONSUMER_DIRS = [
  { dir: join(SRC, "routes"), recursive: false },
  { dir: join(SRC, "features", "home"), recursive: true },
  { dir: join(SRC, "features", "legal"), recursive: true },
  { dir: join(SRC, "features", "faqs"), recursive: true },
];

function collectTsx(dir: string, recursive: boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return recursive ? collectTsx(full, true) : [];
    if (!entry.name.endsWith(".tsx")) return [];
    if (entry.name.includes(".test.")) return [];
    if (entry.name === SHOWCASE) return [];
    return [full];
  });
}

const sources = CONSUMER_DIRS.flatMap(({ dir, recursive }) => collectTsx(dir, recursive)).map(
  (path) => ({
    file: path.slice(path.indexOf("/src/") + 1),
    body: readFileSync(path, "utf8"),
  }),
);

describe("contrato de tipografia do consumer", () => {
  it("varre um conjunto de arquivos não-vazio", () => {
    // Sem isto, um erro de caminho faria os testes abaixo passarem sobre uma lista vazia.
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.map((s) => s.file)).toContain("src/routes/faq.tsx");
  });

  it("nenhum h1 usa display-lg (22px/500), que deixaria o título mais leve que os h2 de 600", () => {
    const offenders = sources
      .filter(({ body }) => /<h1[^>]*text-display-lg/.test(body))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("nenhuma classe de tipografia fantasma: o que o código usa existe no config", () => {
    // `text-body-lg` era usada em faq/sobre/como-funciona e nunca existiu no
    // tailwind.config.ts, então computava 16px/400 herdado sem ninguém notar.
    const ghosts = ["text-body-lg", "text-display-4xl", "text-title-lg", "text-caption-lg"];

    const offenders = sources.flatMap(({ file, body }) =>
      ghosts.filter((ghost) => new RegExp(`\\b${ghost}\\b`).test(body)).map((g) => `${file}: ${g}`),
    );

    expect(offenders).toEqual([]);
  });
});
