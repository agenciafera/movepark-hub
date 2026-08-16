import { describe, expect, it } from "vitest";
import {
  describeDefinition,
  emptyRule,
  fieldDef,
  isGroup,
  operatorNeedsValue,
  operatorsFor,
  ruleIsComplete,
  type SegmentGroup,
  slugify,
  validateDefinition,
} from "./segmentBuilder.logic";

describe("catálogo de campos", () => {
  it("acha campo por chave", () => {
    expect(fieldDef("avg_ticket")?.label).toBe("Ticket médio");
    expect(fieldDef("nao_existe")).toBeUndefined();
  });

  it("oferece operadores compatíveis com o tipo", () => {
    expect(operatorsFor("boolean")).toEqual(["is_true", "is_false"]);
    expect(operatorsFor("number")).toContain("between");
    expect(operatorsFor("enum")).toContain("in");
    // Booleano não pode oferecer "maior que": não existe verdadeiro maior que falso.
    expect(operatorsFor("boolean")).not.toContain("gte");
  });

  it("sabe quais operadores dispensam valor", () => {
    expect(operatorNeedsValue("is_true")).toBe(false);
    expect(operatorNeedsValue("is_empty")).toBe(false);
    expect(operatorNeedsValue("gte")).toBe(true);
  });
});

describe("regra completa", () => {
  it("aceita a regra padrão", () => {
    expect(ruleIsComplete(emptyRule())).toBe(true);
  });

  it("recusa valor vazio em operador que pede valor", () => {
    // O ponto do teste: no Postgres, regra com valor vazio casaria com a base inteira.
    expect(ruleIsComplete({ field: "total_spent", op: "gte", value: "" })).toBe(false);
    expect(ruleIsComplete({ field: "total_spent", op: "gte", value: undefined })).toBe(false);
    expect(ruleIsComplete({ field: "total_spent", op: "gte", value: null })).toBe(false);
  });

  it("aceita zero como valor legítimo", () => {
    // Zero é falsy em JS. "Reservas iguais a 0" é exatamente o público de aquisição.
    expect(ruleIsComplete({ field: "bookings_count", op: "eq", value: 0 })).toBe(true);
  });

  it("between exige os dois extremos", () => {
    expect(ruleIsComplete({ field: "avg_ticket", op: "between", value: [10, 20] })).toBe(true);
    expect(ruleIsComplete({ field: "avg_ticket", op: "between", value: [10] })).toBe(false);
    expect(ruleIsComplete({ field: "avg_ticket", op: "between", value: [10, ""] })).toBe(false);
  });

  it("in exige ao menos um item", () => {
    expect(ruleIsComplete({ field: "cohort", op: "in", value: [] })).toBe(false);
    expect(ruleIsComplete({ field: "cohort", op: "in", value: ["recorrente"] })).toBe(true);
  });

  it("operador sem valor passa mesmo sem valor", () => {
    expect(ruleIsComplete({ field: "subscription_candidate", op: "is_true" })).toBe(true);
  });
});

describe("validação da árvore", () => {
  it("avisa que segmento sem regra pega todo mundo", () => {
    const r = validateDefinition({ match: "all", rules: [] });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain("base inteira");
  });

  it("aponta todos os problemas de uma vez", () => {
    const def: SegmentGroup = {
      match: "all",
      rules: [
        { field: "total_spent", op: "gte", value: "" },
        { field: "avg_ticket", op: "lte", value: "" },
      ],
    };
    const r = validateDefinition(def);
    expect(r.ok).toBe(false);
    expect(r.problems).toHaveLength(2);
  });

  it("desce em grupo aninhado", () => {
    const def: SegmentGroup = {
      match: "all",
      rules: [
        { field: "bookings_count", op: "gte", value: 2 },
        { match: "any", rules: [] },
      ],
    };
    const r = validateDefinition(def);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("grupo"))).toBe(true);
  });

  it("aprova árvore completa", () => {
    const def: SegmentGroup = {
      match: "all",
      rules: [
        { field: "bookings_count", op: "gte", value: 2 },
        {
          match: "any",
          rules: [
            { field: "cohort", op: "in", value: ["recorrente", "campeao"] },
            { field: "subscription_candidate", op: "is_true" },
          ],
        },
      ],
    };
    expect(validateDefinition(def).ok).toBe(true);
  });
});

describe("resumo em português", () => {
  it("descreve regras simples com 'e'", () => {
    const texto = describeDefinition({
      match: "all",
      rules: [
        { field: "bookings_count", op: "gte", value: 2 },
        { field: "days_since_last", op: "lte", value: 90 },
      ],
    });
    expect(texto).toBe(
      "Reservas pagas é maior ou igual a 2 e Dias desde a última compra é menor ou igual a 90",
    );
  });

  it("usa 'ou' quando o grupo é 'any' e parênteses no aninhado", () => {
    const texto = describeDefinition({
      match: "all",
      rules: [
        { field: "bookings_count", op: "gte", value: 1 },
        {
          match: "any",
          rules: [
            { field: "cohort", op: "eq", value: "em_risco" },
            { field: "cohort", op: "eq", value: "inativo" },
          ],
        },
      ],
    });
    expect(texto).toContain("(Coorte é igual a Em risco ou Coorte é igual a Inativo)");
  });

  it("troca o valor do enum pelo rótulo legível", () => {
    const texto = describeDefinition({
      match: "all",
      rules: [{ field: "growth_stage", op: "eq", value: "reativacao" }],
    });
    expect(texto).toBe("Estágio de growth é igual a Reativação");
    expect(texto).not.toContain("reativacao");
  });

  it("omite valor em operador que não pede", () => {
    const texto = describeDefinition({
      match: "all",
      rules: [{ field: "subscription_candidate", op: "is_true" }],
    });
    expect(texto).toBe("Candidato a assinante é sim");
  });

  it("segmento vazio se descreve como todo mundo", () => {
    expect(describeDefinition({ match: "all", rules: [] })).toBe("todos os contatos");
  });
});

describe("utilidades", () => {
  it("isGroup separa grupo de regra", () => {
    expect(isGroup({ match: "all", rules: [] })).toBe(true);
    expect(isGroup({ field: "x", op: "eq", value: 1 })).toBe(false);
  });

  it("slugify tira acento, espaço e pontuação", () => {
    expect(slugify("Clientes em risco (Confins)")).toBe("clientes-em-risco-confins");
    expect(slugify("Ação de Reativação")).toBe("acao-de-reativacao");
  });
});
