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

const read = (path: string) => ({
  file: path.slice(path.indexOf("/src/") + 1),
  body: readFileSync(path, "utf8"),
});

const sources = CONSUMER_DIRS.flatMap(({ dir, recursive }) => collectTsx(dir, recursive)).map(read);

/**
 * A checagem de classe fantasma vale para o app inteiro, não só para o consumer.
 *
 * O escopo antigo (`src/routes` sem recursão) deixava `routes/operator/`,
 * `routes/manager/` e `features/` de fora, e foi assim que `text-title-lg`
 * sobreviveu em 6 lugares mesmo estando nomeada na lista de fantasmas deste
 * arquivo: a guarda existia, apontava a classe certa e não a enxergava.
 */
const allSources = collectTsx(SRC, true).map(read);

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

  it("os tiers de hero e de seção são fluidos: sem clamp, o mobile herda o px do desktop", () => {
    // display-2xl fixo em 44px punia justamente quem usava o token certo:
    // /seja-parceiro entregava h1 e 7 h2 todos em 44px numa tela de 375px.
    const config = readFileSync(join(process.cwd(), "tailwind.config.ts"), "utf8");

    expect(config).toMatch(/"display-3xl":\s*\[\s*\n?\s*"clamp\(/);
    expect(config).toMatch(/"display-2xl":\s*\[\s*\n?\s*"clamp\(/);
  });

  it("nenhum heading combina px arbitrário com o token fluido no tablet", () => {
    // `text-[36px] tablet:text-display-2xl` encolhe de 36px para 34.8px ao cruzar
    // o breakpoint, porque o token fluido só alcança 36px por volta de 800px.
    const offenders = sources
      .filter(({ body }) => /text-\[\d+px\][^"]*tablet:text-display-/.test(body))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("nenhuma classe de tipografia fantasma em todo o src: o que o código usa existe no config", () => {
    // `text-body-lg` era usada em faq/sobre/como-funciona e nunca existiu no
    // tailwind.config.ts, então computava 16px/400 herdado sem ninguém notar.
    // A lista fixa que morava aqui envelhecia: agora os degraus válidos são lidos
    // do próprio config, então uma classe nova só passa se o token existir.
    const config = readFileSync(join(process.cwd(), "tailwind.config.ts"), "utf8");
    const block = config.match(/fontSize:\s*\{([\s\S]*?)\n {6}\},/)?.[1];
    expect(block, "não achei o bloco fontSize no tailwind.config.ts").toBeTruthy();

    const valid = new Set(
      [...block!.replace(/\/\/.*$/gm, "").matchAll(/^\s{8}"?([a-z0-9-]+)"?:\s*\[/gm)].map(
        (m) => m[1],
      ),
    );
    expect(valid.size).toBeGreaterThan(10);

    // Prefixos que só existem como degrau de tipografia. `badge` fica de fora de
    // propósito: `text-badge-confirmed-fg` e companhia são COR, não tamanho.
    const typographic = /\btext-((?:display|title|body|caption|button)-[a-z0-9]+)\b/g;

    const offenders = allSources.flatMap(({ file, body }) =>
      [...body.matchAll(typographic)]
        .map((m) => m[1])
        .filter((token) => !valid.has(token))
        .map((token) => `${file}: text-${token}`),
    );

    expect([...new Set(offenders)]).toEqual([]);
  });
});
