import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda o contrato de heading-pergunta das superfícies públicas.
 *
 * Um H2 em forma de pergunta sem "?" ("Quanto custa estacionar no Aeroporto Viracopos")
 * deixa de ser uma unidade de pergunta e resposta: o extrator de trecho do buscador e o
 * chunker de LLM decidem pelo texto, e sem o "?" a mesma frase lê como título de seção.
 * O custo aparece no GEO antes do SEO, porque quem cita a resposta é a IA, e ela precisa
 * de um par pergunta -> parágrafo para citar.
 *
 * O teste é varredura de fonte porque o drift entra por copy nova, que passa por
 * typecheck, lint e render sem reclamar. Foi assim que a página do destino ficou com o H1
 * do FAQ perguntando com "?" e o H2 da mesma pergunta respondendo sem.
 *
 * A regra é estreita de propósito: só pega heading que ABRE com palavra interrogativa e
 * fecha uma pergunta direta. Título declarativo ("Distância até o terminal", "Tabela de
 * preços") não vira pergunta, e frase afirmativa que começa com pronome interrogativo
 * ("Quem já é parceiro conta") mora na allowlist abaixo.
 */

const SRC = join(process.cwd(), "src");

/** Palavras que abrem pergunta direta em pt-BR. */
const INTERROGATIVA =
  /^(quanto|quantos|quantas|onde|de onde|aonde|como|o que|por que|quando|qual|quais|quem)\b/i;

/**
 * Headings que abrem com pronome interrogativo mas são afirmação, não pergunta.
 * Entrada nova aqui precisa de motivo escrito: a allowlist é a exceção, não a saída.
 */
const AFIRMACOES = new Set([
  // Chamada dos depoimentos: quem é parceiro conta a experiência, não pergunta nada.
  "Quem já é parceiro conta",
  // Negativa de posicionamento, com ponto final de propósito (voz da marca).
  "O que a Movepark não é.",
]);

/** A superfície pública: rotas na raiz de `src/routes` mais as features que só elas usam. */
const DIRS_PUBLICOS = [
  { dir: join(SRC, "routes"), recursive: false },
  { dir: join(SRC, "features", "home"), recursive: true },
  { dir: join(SRC, "features", "faqs"), recursive: true },
  { dir: join(SRC, "features", "destinations"), recursive: true },
  { dir: join(SRC, "features", "listing"), recursive: true },
  { dir: join(SRC, "features", "content"), recursive: true },
];

/** A vitrine do design system exibe headings de exemplo, fora do contrato de conteúdo. */
const VITRINE = "design-system.tsx";

function coletarTsx(dir: string, recursive: boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return recursive ? coletarTsx(full, true) : [];
    if (!entry.name.endsWith(".tsx")) return [];
    if (entry.name.includes(".test.")) return [];
    if (entry.name === VITRINE) return [];
    return [full];
  });
}

/** Texto de cada `<hN>`, com expressão JSX reduzida a um marcador. */
function headingsDoTsx(fonte: string): string[] {
  const achados: string[] = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte))) {
    const texto = m[2]
      .replace(/\{[^{}]*\}/g, "•")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (texto && texto !== "•") achados.push(texto);
  }
  return achados;
}

function semInterrogacao(headings: string[]): string[] {
  return headings.filter(
    (h) => INTERROGATIVA.test(h) && !h.includes("?") && !AFIRMACOES.has(h),
  );
}

describe("contrato de heading-pergunta (SEO/GEO)", () => {
  it("nenhum heading em forma de pergunta fica sem '?' nas páginas públicas", () => {
    const faltando = DIRS_PUBLICOS.flatMap(({ dir, recursive }) =>
      coletarTsx(dir, recursive).flatMap((arquivo) =>
        semInterrogacao(headingsDoTsx(readFileSync(arquivo, "utf8"))).map(
          (h) => `${arquivo.replace(process.cwd() + "/", "")}: ${h}`,
        ),
      ),
    );
    expect(faltando).toEqual([]);
  });

  it("o gêmeo markdown repete a mesma pergunta que a página React", () => {
    const gerador = readFileSync(
      join(process.cwd(), "scripts", "generate-geo-artifacts.mjs"),
      "utf8",
    );
    // Heading markdown literal: `## ...` ou "## ...", com expressão virando marcador.
    const headings = [...gerador.matchAll(/[`"]#{2,4} ([^`"\n]+)[`"]/g)].map((m) =>
      m[1].replace(/\$\{[^{}]*\}/g, "•").trim(),
    );
    expect(semInterrogacao(headings)).toEqual([]);
  });
});
