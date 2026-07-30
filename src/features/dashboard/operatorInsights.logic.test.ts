import { describe, expect, it } from "vitest";
import {
  agendaHours,
  agendaStrip,
  bestRevenueDay,
  concentrationWindow,
  conversion,
  goalProgress,
  greeting,
  periodInsight,
  situations,
} from "./operatorInsights.logic";

const funnel = [
  { status: "completed", count: 4 },
  { status: "expired", count: 19 },
  { status: "no_show", count: 1 },
];

describe("conversion", () => {
  it("conta pagas sobre criadas e separa abandono de cancelamento", () => {
    expect(conversion(funnel)).toEqual({
      paid: 4,
      created: 24,
      rate: 17,
      expired: 19,
      cancelled: 0,
      noShow: 1,
    });
  });

  it("funil vazio não divide por zero", () => {
    expect(conversion([])).toMatchObject({ paid: 0, created: 0, rate: 0 });
  });

  it("confirmada e em uso contam como paga", () => {
    expect(
      conversion([
        { status: "confirmed", count: 2 },
        { status: "checked_in", count: 1 },
        { status: "pending", count: 1 },
      ]).paid,
    ).toBe(3);
  });
});

describe("situations", () => {
  it("ordena da maior pra menor e calcula o percentual sobre o criado", () => {
    const rows = situations(funnel);
    expect(rows.map((r) => r.status)).toEqual(["expired", "completed", "no_show"]);
    expect(rows[0]).toMatchObject({ count: 19, pct: 79 });
  });

  it("situação zerada não vira linha", () => {
    expect(situations([{ status: "cancelled", count: 0 }])).toEqual([]);
  });
});

describe("bestRevenueDay / concentrationWindow", () => {
  const daily = [
    { date: "2026-07-01", total: 0 },
    { date: "2026-07-02", total: 5 },
    { date: "2026-07-03", total: 0 },
    { date: "2026-07-04", total: 95 },
  ];

  it("acha o melhor dia e ignora dia zerado", () => {
    expect(bestRevenueDay(daily)).toEqual({ date: "2026-07-04", total: 95 });
    expect(bestRevenueDay([{ date: "2026-07-01", total: 0 }])).toBeNull();
  });

  it("diz em quantos dias do fim entrou 90% da receita", () => {
    expect(concentrationWindow(daily)).toBe(1);
  });

  it("receita espalhada não vira concentração", () => {
    const flat = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      total: 10,
    }));
    expect(concentrationWindow(flat)).toBe(9);
  });

  it("sem receita, a janela é zero em vez de NaN", () => {
    expect(concentrationWindow([{ date: "2026-07-01", total: 0 }])).toBe(0);
  });
});

describe("goalProgress", () => {
  it("converte centavos e limita a barra a 100%", () => {
    expect(goalProgress(200, 40000)).toMatchObject({ target: 400, pct: 50, width: "50%" });
    expect(goalProgress(900, 40000)).toMatchObject({ pct: 100, width: "100%", reached: true });
  });

  it("sem meta, devolve target null e não desenha barra", () => {
    expect(goalProgress(200, null)).toEqual({ target: null, pct: 0, width: "0%", reached: false });
    expect(goalProgress(200, 0).target).toBeNull();
  });
});

describe("periodInsight", () => {
  const base = { revenue: 100, daily: [], periodDays: 30 };

  it("sem reserva criada, não inventa leitura", () => {
    expect(periodInsight({ ...base, conversion: conversion([]) })).toBeNull();
  });

  it("nada pago é a leitura mais urgente", () => {
    const i = periodInsight({
      ...base,
      revenue: 0,
      conversion: conversion([{ status: "expired", count: 7 }]),
    });
    expect(i?.title).toBe("Nenhuma reserva pagou no período");
    expect(i?.detail).toContain("7 reservas criadas");
  });

  it("receita empilhada no fim vira a leitura, com o número de dias", () => {
    const daily = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      total: i >= 28 ? 50 : 0,
    }));
    const i = periodInsight({
      revenue: 100,
      daily,
      conversion: conversion(funnel),
      periodDays: 30,
    });
    expect(i?.title).toBe("Quase toda a receita entrou nos últimos 2 dias");
  });

  it("receita espalhada cai na leitura de conversão", () => {
    const daily = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      total: 10,
    }));
    const i = periodInsight({
      revenue: 300,
      daily,
      conversion: conversion(funnel),
      periodDays: 30,
    });
    expect(i?.title).toBe("17% das reservas criadas chegaram a pagar");
    expect(i?.detail).toContain("19 expiraram sem pagamento");
  });

  it("conversão saudável cai no retrato do período, sem adjetivo", () => {
    const conv = conversion([
      { status: "completed", count: 8 },
      { status: "expired", count: 2 },
    ]);
    const daily = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      total: 10,
    }));
    const i = periodInsight({ revenue: 300, daily, conversion: conv, periodDays: 30 });
    expect(i?.title).toBe("8 reservas pagas no período");
  });

  it("singular e plural acompanham o número", () => {
    const conv = conversion([
      { status: "completed", count: 1 },
      { status: "expired", count: 1 },
    ]);
    const i = periodInsight({ revenue: 10, daily: [], conversion: conv, periodDays: 2 });
    expect(i?.title).toBe("1 reserva paga no período");
    expect(i?.detail).toContain("chegou ao pagamento");
  });
});

describe("greeting", () => {
  it("acompanha a hora local", () => {
    expect(greeting(8)).toBe("Bom dia");
    expect(greeting(13)).toBe("Boa tarde");
    expect(greeting(19)).toBe("Boa noite");
    expect(greeting(0)).toBe("Bom dia");
  });
});

describe("agendaHours", () => {
  it("abre uma hora antes e fecha uma depois do movimento", () => {
    expect(agendaHours([9, 14])).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("não estoura os limites do dia", () => {
    expect(agendaHours([0])).toEqual([0, 1]);
    expect(agendaHours([23])).toEqual([22, 23]);
  });

  it("dia sem evento mostra o comercial", () => {
    expect(agendaHours([])).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });
});

describe("agendaStrip", () => {
  it("põe o dia escolhido no meio, com três de cada lado", () => {
    const strip = agendaStrip("2026-07-29");
    expect(strip).toHaveLength(7);
    expect(strip[3]).toBe("2026-07-29");
    expect(strip[0]).toBe("2026-07-26");
    expect(strip[6]).toBe("2026-08-01");
  });

  it("atravessa a virada do mês sem quebrar", () => {
    expect(agendaStrip("2026-03-01")[0]).toBe("2026-02-26");
  });
});
