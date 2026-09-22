/**
 * Varredura de `<title>` e `<meta name="description">` do site inteiro.
 *
 * Existe porque a regra de SERP do projeto é fácil de escrever uma vez e impossível de
 * manter à mão: em 22/09/2026, a varredura encontrou 11 páginas com título sem a
 * palavra-chave ("Sobre nós | Movepark", "Como Funciona | Movepark") e 9 descriptions sem
 * preço e sem CTA. Corrigir uma vez resolve o dia; este teste resolve o mês seguinte.
 *
 * A regra, igual para toda página indexável:
 *
 *   1. `<title>` até 62 caracteres, com a palavra-chave da página;
 *   2. `<meta name="description">` entre 120 e 160 caracteres;
 *   3. a description abre pela palavra-chave, mostra o menor preço (ou a prova que a página
 *      consegue sustentar) e fecha num CTA no imperativo.
 *
 * O que dá para verificar estaticamente é o texto **literal** dos arquivos de rota. Página
 * cuja description é montada em tempo de execução (destino, unidade, preços, FAQ, blog) é
 * coberta por outro caminho: o teste exige que ela importe o construtor de `@/lib/seo`, que
 * é quem garante a estrutura, e o contrato do construtor é testado em `src/lib/seo.test.ts`.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = "src/routes";

/**
 * Rotas fora da regra, cada uma com o motivo. Estar aqui é decisão, não esquecimento: a
 * lista espelha o `SITEMAP_OPT_OUT`, e página nova indexável não tem como entrar sem
 * passar pela regra.
 */
const FORA_DA_REGRA: Record<string, string> = {
  "docs.tsx": "documentação técnica da API, fora da superfície de consumidor e do sitemap",
  "not-found.tsx": "página de erro; o worker responde 404 nela",
  "onboarding.tsx": "fluxo de cadastro de parceiro, sem conteúdo indexável",
  "motor-preview.tsx": "ferramenta interna de preço",
  "design-system.tsx": "catálogo visual interno",
  "login.tsx": "autenticação",
  "search.tsx": "resultado parametrizado, fora do sitemap",
};

/** O núcleo da palavra-chave do site. Título sem nenhum destes não disputa consulta nenhuma. */
const NUCLEO = /estacionament|vaga|reserva|preço|aeroporto/i;

/**
 * Verbo no imperativo que fecha a frase. A lista é curta de propósito: CTA que não está
 * aqui provavelmente é uma descrição disfarçada de convite ("Saiba mais sobre...").
 */
const CTA =
  /\b(reserve|compare|confira|veja|fale|leia|chame|cadastre|busque|escolha|conheça)\b/i;

type Meta = { arquivo: string; titles: string[]; descriptions: string[]; fonte: string };

/**
 * Constante de description declarada no topo do módulo, incluindo a forma quebrada em várias
 * linhas com `+`. Sem isso, metade das páginas escapava da varredura só por ter dado um nome
 * ao próprio texto (`const DESCRIPTION = "..."`), que é exatamente o que o projeto pede.
 */
function constantesDeDescription(fonte: string): string[] {
  const achados: string[] = [];
  // Só constante com nome de description (ou `META`, como em /grupo e /selo): `NO_SCOPE_HINT`
  // e afins também são string longa
  // no topo de um módulo, e varrer pelo formato pegava página de admin que nem tem `<title>`.
  const re =
    /^const [A-Z0-9_]*(?:DESCRIPTION|DESCRICAO|DESC|META)[A-Z0-9_]*\s*=\s*((?:\s*"(?:[^"\\]|\\.)*"\s*\+?)+);/gm;
  for (const m of fonte.matchAll(re)) {
    const texto = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((s) => s[1]).join("");
    // Só o que tem cara de frase: classe do Tailwind e caminho de rota também são const.
    if (texto.length >= 60 && /\s/.test(texto)) achados.push(texto);
  }
  return achados;
}

function lerRotas(): Meta[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
    .sort()
    .map((arquivo) => {
      const fonte = fs.readFileSync(path.join(DIR, arquivo), "utf8");
      const temMeta = fonte.includes('name="description"');
      const inline = [...fonte.matchAll(/name="description"\s*\n?\s*content="([^"]+)"/g)].map(
        (m) => m[1].trim(),
      );
      return {
        arquivo,
        fonte,
        titles: [...fonte.matchAll(/<title>([^<{][^<]*)<\/title>/g)].map((m) => m[1].trim()),
        descriptions: temMeta ? [...inline, ...constantesDeDescription(fonte)] : [],
      };
    });
}

const rotas = lerRotas().filter((r) => !(r.arquivo in FORA_DA_REGRA));

describe("varredura de SEO: títulos", () => {
  it.each(rotas.filter((r) => r.titles.length > 0).map((r) => [r.arquivo, r.titles] as const))(
    "%s: o título cabe na SERP e carrega a palavra-chave",
    (_arquivo, titles) => {
      for (const t of titles) {
        expect(t.length).toBeLessThanOrEqual(62);
        expect(t.length).toBeGreaterThanOrEqual(20);
        expect(t).toMatch(NUCLEO);
      }
    },
  );
});

describe("varredura de SEO: meta descriptions", () => {
  it.each(
    rotas.filter((r) => r.descriptions.length > 0).map((r) => [r.arquivo, r.descriptions] as const),
  )("%s: tamanho, palavra-chave na abertura e CTA no fim", (_arquivo, descriptions) => {
    for (const d of descriptions) {
      expect(d.length).toBeGreaterThanOrEqual(120);
      expect(d.length).toBeLessThanOrEqual(160);
      // Palavra-chave na abertura: é ela que o Google marca em negrito no snippet.
      expect(d.slice(0, 60)).toMatch(NUCLEO);
      // O CTA fecha a frase: description sem verbo descreve a página em vez de vender o clique.
      const ultimaFrase = d.split(/(?<=[.!?])\s+/).at(-1) ?? d;
      expect(ultimaFrase).toMatch(CTA);
    }
  });

  it("nenhuma description usa travessão (regra de marca do CLAUDE.md)", () => {
    for (const r of rotas) {
      for (const texto of [...r.titles, ...r.descriptions]) {
        expect(texto).not.toMatch(/[—–]/);
      }
    }
  });
});

describe("varredura de SEO: páginas com description montada em runtime", () => {
  /** Quem monta a description no render tem que montar pelo construtor único. */
  const CONSTRUTORES = [
    "buildMetaDescription",
    "listingDescription",
    "destinationMetaDescription",
    "metaDescription",
  ];

  const dinamicas = rotas.filter(
    (r) => /name="description" content=\{/.test(r.fonte) && r.descriptions.length === 0,
  );

  it("há páginas dinâmicas para checar (senão o regex quebrou e o teste vira decorativo)", () => {
    expect(dinamicas.length).toBeGreaterThanOrEqual(6);
  });

  it.each(dinamicas.map((r) => [r.arquivo, r.fonte] as const))(
    "%s: a description sai do construtor único de @/lib/seo",
    (_arquivo, fonte) => {
      expect(CONSTRUTORES.some((c) => fonte.includes(c))).toBe(true);
    },
  );
});
