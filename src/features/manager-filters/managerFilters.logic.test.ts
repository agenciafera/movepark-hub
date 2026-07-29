import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERIOD,
  compareLabel,
  formatRangeLabel,
  groupLocations,
  locationsLabel,
  periodDays,
  periodLabel,
  pruneLocations,
  resolveCompare,
  resolvePeriod,
  toDayString,
  toggleLocation,
  type PeriodState,
} from "./managerFilters.logic";

// Quarta-feira, 15 de julho de 2026, 14h. Relógio fixo: o teste não pode depender
// do dia em que roda.
const NOW = new Date(2026, 6, 15, 14, 30);

const state = (over: Partial<PeriodState> = {}): PeriodState => ({ ...DEFAULT_PERIOD, ...over });

describe("resolvePeriod", () => {
  it("hoje vai do 00:00 de hoje ao 00:00 de amanhã", () => {
    const r = resolvePeriod(state({ preset: "today" }), NOW);
    expect(toDayString(r.from)).toBe("2026-07-15");
    expect(toDayString(r.to)).toBe("2026-07-16");
  });

  it("ontem fecha no começo de hoje", () => {
    const r = resolvePeriod(state({ preset: "yesterday" }), NOW);
    expect(toDayString(r.from)).toBe("2026-07-14");
    expect(toDayString(r.to)).toBe("2026-07-15");
  });

  it("a semana começa na segunda", () => {
    const r = resolvePeriod(state({ preset: "thisWeek" }), NOW);
    expect(toDayString(r.from)).toBe("2026-07-13");
    expect(toDayString(r.to)).toBe("2026-07-20");
  });

  it("semana passada é a anterior inteira", () => {
    const r = resolvePeriod(state({ preset: "lastWeek" }), NOW);
    expect(toDayString(r.from)).toBe("2026-07-06");
    expect(toDayString(r.to)).toBe("2026-07-13");
  });

  it("últimos 7 dias inclui hoje", () => {
    const r = resolvePeriod(state({ preset: "last7" }), NOW);
    expect(toDayString(r.from)).toBe("2026-07-09");
    expect(toDayString(r.to)).toBe("2026-07-16");
    expect(periodDays(r)).toBe(7);
  });

  it("este mês e mês passado batem no primeiro dia", () => {
    expect(toDayString(resolvePeriod(state({ preset: "thisMonth" }), NOW).from)).toBe("2026-07-01");
    expect(toDayString(resolvePeriod(state({ preset: "thisMonth" }), NOW).to)).toBe("2026-08-01");
    expect(toDayString(resolvePeriod(state({ preset: "lastMonth" }), NOW).from)).toBe("2026-06-01");
    expect(toDayString(resolvePeriod(state({ preset: "lastMonth" }), NOW).to)).toBe("2026-07-01");
  });

  it("este ano e ano passado cobrem o ano inteiro", () => {
    expect(toDayString(resolvePeriod(state({ preset: "thisYear" }), NOW).from)).toBe("2026-01-01");
    expect(toDayString(resolvePeriod(state({ preset: "thisYear" }), NOW).to)).toBe("2027-01-01");
    expect(toDayString(resolvePeriod(state({ preset: "lastYear" }), NOW).from)).toBe("2025-01-01");
    expect(toDayString(resolvePeriod(state({ preset: "lastYear" }), NOW).to)).toBe("2026-01-01");
  });

  it("personalizado trata a ponta final como dia inclusivo", () => {
    const r = resolvePeriod(
      state({ preset: "custom", customFrom: "2026-03-10", customTo: "2026-03-12" }),
      NOW,
    );
    expect(toDayString(r.from)).toBe("2026-03-10");
    // 12 escolhido pela pessoa vira 13 exclusivo, senão o dia 12 ficava de fora.
    expect(toDayString(r.to)).toBe("2026-03-13");
    expect(periodDays(r)).toBe(3);
  });

  it("personalizado com as pontas invertidas se endireita", () => {
    const r = resolvePeriod(
      state({ preset: "custom", customFrom: "2026-03-12", customTo: "2026-03-10" }),
      NOW,
    );
    expect(toDayString(r.from)).toBe("2026-03-10");
    expect(toDayString(r.to)).toBe("2026-03-13");
  });

  it("personalizado sem as duas pontas cai no default de 30 dias", () => {
    const r = resolvePeriod(state({ preset: "custom", customFrom: "2026-03-10" }), NOW);
    expect(periodDays(r)).toBe(30);
  });
});

describe("resolveCompare", () => {
  const period = resolvePeriod(state({ preset: "thisMonth" }), NOW);

  it("período anterior é do mesmo tamanho, colado no início", () => {
    const c = resolveCompare(state({ preset: "thisMonth", compare: "previous" }), period);
    expect(c).not.toBeNull();
    expect(c!.to.getTime()).toBe(period.from.getTime());
    expect(c!.to.getTime() - c!.from.getTime()).toBe(period.to.getTime() - period.from.getTime());
  });

  it("ano passado desloca as duas pontas em um ano", () => {
    const c = resolveCompare(state({ preset: "thisMonth", compare: "lastYear" }), period)!;
    expect(toDayString(c.from)).toBe("2025-07-01");
    expect(toDayString(c.to)).toBe("2025-08-01");
  });

  it("sem comparação devolve null", () => {
    expect(resolveCompare(state({ compare: "none" }), period)).toBeNull();
  });

  it("comparação personalizada incompleta devolve null em vez de um intervalo torto", () => {
    expect(
      resolveCompare(state({ compare: "custom", compareFrom: "2026-01-01" }), period),
    ).toBeNull();
  });
});

describe("rótulos", () => {
  it("preset mostra o nome; personalizado mostra as datas", () => {
    const p = state({ preset: "last30" });
    expect(periodLabel(p, resolvePeriod(p, NOW))).toBe("Últimos 30 dias");
    const c = state({ preset: "custom", customFrom: "2026-03-10", customTo: "2026-03-12" });
    expect(periodLabel(c, resolvePeriod(c, NOW))).toContain("10");
  });

  it("um dia só não vira intervalo", () => {
    const r = resolvePeriod(state({ preset: "today" }), NOW);
    expect(formatRangeLabel(r)).toBe("15 de jul de 2026");
  });

  it("a ponta final do rótulo é o dia inclusivo, não o exclusivo interno", () => {
    const r = resolvePeriod(state({ preset: "thisMonth" }), NOW);
    // O intervalo termina em 1 de agosto (exclusivo), mas o rótulo diz 31 de julho.
    expect(formatRangeLabel(r)).toContain("31");
    expect(formatRangeLabel(r)).not.toContain("ago");
  });

  it("a comparação é nomeada pela base escolhida", () => {
    const p = state({ preset: "thisMonth", compare: "lastYear" });
    const range = resolvePeriod(p, NOW);
    expect(compareLabel(p, resolveCompare(p, range))).toBe("vs. ano passado");
    expect(compareLabel(state({ compare: "none" }), null)).toBeNull();
  });
});

describe("seleção de unidade", () => {
  const options = [
    { id: "a", name: "Aeropark GRU", companyName: "Aeropark" },
    { id: "b", name: "Virapark VCP", companyName: "Virapark" },
    { id: "c", name: "Aeropark CGH", companyName: "Aeropark" },
  ];

  it("nenhuma marcada quer dizer todas", () => {
    expect(locationsLabel([], options)).toBe("Todas as unidades");
    expect(locationsLabel(["a"], options)).toBe("Aeropark GRU");
    expect(locationsLabel(["a", "b"], options)).toBe("2 unidades");
  });

  it("agrupa por empresa em ordem alfabética", () => {
    const groups = groupLocations(options);
    expect(groups.map((g) => g.companyName)).toEqual(["Aeropark", "Virapark"]);
    expect(groups[0].locations.map((l) => l.name)).toEqual(["Aeropark CGH", "Aeropark GRU"]);
  });

  it("a busca casa com o nome da unidade ou o da empresa", () => {
    expect(groupLocations(options, "vira")).toHaveLength(1);
    expect(groupLocations(options, "cgh")[0].locations).toHaveLength(1);
    expect(groupLocations(options, "nada")).toHaveLength(0);
  });

  it("marcar e desmarcar não muta a lista original", () => {
    const selected = ["a"];
    expect(toggleLocation(selected, "b")).toEqual(["a", "b"]);
    expect(toggleLocation(selected, "a")).toEqual([]);
    expect(selected).toEqual(["a"]);
  });

  it("unidade que sumiu da lista sai da seleção", () => {
    // Sem isso o filtro guardado zerava a tela sem nada marcado explicando por quê.
    expect(pruneLocations(["a", "zumbi"], options)).toEqual(["a"]);
  });

  it("seleção válida volta a MESMA referência (não dispara re-render à toa)", () => {
    const selected = ["a", "b"];
    expect(pruneLocations(selected, options)).toBe(selected);
    expect(pruneLocations(selected, [])).toBe(selected);
  });
});
