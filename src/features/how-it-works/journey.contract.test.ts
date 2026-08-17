import { describe, expect, it } from "vitest";
import {
  JOURNEY,
  JOURNEY_COMPARISON,
  JOURNEY_FAQ,
  JOURNEY_GUARANTEES,
  journeyHowToJsonLd,
} from "./journey";
import { HOW_IT_WORKS } from "./copy";

/**
 * Cada trecho é uma unidade de leitura completa, não uma frase solta: a pergunta
 * do FAQ e a resposta dela viajam juntas, senão "O traslado é gratuito?" seria
 * lida como promessa quando ela é justamente o contrário, a dúvida que a resposta
 * qualifica logo abaixo.
 */
const TRECHOS = [
  ...JOURNEY.flatMap((m) => [`${m.title} ${m.lead}`, ...m.steps.map((s) => s.text)]),
  ...JOURNEY_GUARANTEES.map((g) => `${g.title} ${g.text}`),
  ...JOURNEY_COMPARISON.map((c) => `${c.mp} ${c.other}`),
  ...JOURNEY_FAQ.map((f) => `${f.q} ${f.a}`),
].map((t) => t.toLowerCase());

const textoDaJornada = TRECHOS.join(" ");

describe("contrato da jornada da /como-funciona", () => {
  it("a numeração corre de 1 a 7 sem repetir nem pular momento", () => {
    const ns = JOURNEY.flatMap((m) => m.steps.map((s) => s.n));
    expect(ns).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(JOURNEY).toHaveLength(3);
  });

  it("o HowTo sai dos mesmos passos que a tela mostra", () => {
    const schema = journeyHowToJsonLd();
    expect(schema.step.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(schema.step.map((s) => s.text)).toEqual(JOURNEY.flatMap((m) => m.steps.map((s) => s.text)));
  });

  /**
   * Mesma regra que `copy.contract.test.ts` aplica ao resumo de 3 passos: traslado
   * é fato da unidade, não da plataforma. Em 21/07/2026 eram 16 unidades com
   * traslado em 28 vendáveis, e 12 delas nem ficam em aeroporto. A página pode
   * citar o traslado, desde que qualificado por "onde a unidade" ou "depende".
   */
  it("nenhuma menção a traslado aparece como promessa da plataforma", () => {
    const comTraslado = TRECHOS.filter((t) => t.includes("traslado") || t.includes("van "));

    expect(comTraslado.length, "esperava alguma menção a traslado para qualificar").toBeGreaterThan(
      0,
    );
    for (const trecho of comTraslado) {
      expect(trecho, `promessa de traslado sem qualificador: "${trecho}"`).toMatch(
        /onde a unidade|depende da unidade|nem todo/,
      );
    }
  });

  it("não promete cancelamento grátis sem amarrar na Tarifa", () => {
    for (const trecho of TRECHOS.filter((t) => t.includes("grátis"))) {
      expect(trecho, `cancelamento sem condição: "${trecho}"`).toMatch(/tarifa|conforme/);
    }
  });

  /**
   * A home e a /sobre resumem esta mesma jornada em 3 passos. Se o resumo passar a
   * prometer check-in de um jeito e a página longa de outro, quem lê as duas pega
   * a divergência antes da gente.
   */
  it("o resumo de 3 passos e a jornada longa contam a mesma chegada", () => {
    const resumo = HOW_IT_WORKS.steps.map((s) => s.text).join(" ").toLowerCase();
    expect(resumo).toContain("qr code");
    expect(textoDaJornada).toContain("qr code");
  });
});
