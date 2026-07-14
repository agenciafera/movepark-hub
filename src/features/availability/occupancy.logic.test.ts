import { describe, expect, it } from "vitest";
import {
  buildDayAriaLabel,
  buildOccupancyMatrix,
  contrastRatio,
  formatDayLong,
  INK_HEX,
  monthGrid,
  monthsInRange,
  OCCUPANCY_SCALE,
  occupancyStep,
  occupancyStyle,
  pickTextColor,
  WHITE_HEX,
  withExternal,
} from "./occupancy.logic";
import type { LocationOccupancyRow } from "@/types/domain";

const rows: LocationOccupancyRow[] = [
  { location_parking_type_id: "b", parking_type_name: "Valet", date: "2026-10-02", capacity: 10, booked_count: 2, blocked: false },
  { location_parking_type_id: "a", parking_type_name: "Coberta", date: "2026-10-01", capacity: 4, booked_count: 4, blocked: false },
  { location_parking_type_id: "a", parking_type_name: "Coberta", date: "2026-10-02", capacity: 4, booked_count: 1, blocked: true },
  { location_parking_type_id: "b", parking_type_name: "Valet", date: "2026-10-01", capacity: 10, booked_count: 0, blocked: false },
];

describe("buildOccupancyMatrix", () => {
  it("ordena datas e tipos de vaga", () => {
    const m = buildOccupancyMatrix(rows);
    expect(m.dates).toEqual(["2026-10-01", "2026-10-02"]);
    expect(m.rows.map((r) => r.name)).toEqual(["Coberta", "Valet"]);
  });

  it("preenche células com capacity/booked/pct", () => {
    const m = buildOccupancyMatrix(rows);
    const coberta = m.rows.find((r) => r.name === "Coberta")!;
    expect(coberta.cells["2026-10-01"]).toEqual({
      date: "2026-10-01",
      capacity: 4,
      booked: 4,
      pct: 1,
      blocked: false,
    });
    expect(coberta.cells["2026-10-02"].pct).toBeCloseTo(0.25, 5);
  });

  it("propaga o estado de bloqueio da data", () => {
    const m = buildOccupancyMatrix(rows);
    const coberta = m.rows.find((r) => r.name === "Coberta")!;
    expect(coberta.cells["2026-10-02"].blocked).toBe(true);
    expect(coberta.cells["2026-10-01"].blocked).toBe(false);
  });

  it("pct = 0 quando capacity = 0 (sem divisão por zero)", () => {
    const m = buildOccupancyMatrix([
      { location_parking_type_id: "x", parking_type_name: "Z", date: "2026-10-01", capacity: 0, booked_count: 0, blocked: false },
    ]);
    expect(m.rows[0].cells["2026-10-01"].pct).toBe(0);
  });

  it("matriz vazia para entrada vazia", () => {
    expect(buildOccupancyMatrix([])).toEqual({ dates: [], rows: [] });
  });
});

describe("withExternal", () => {
  it("soma hub + WL e limita pct a 1", () => {
    expect(withExternal(3, 2, 10)).toEqual({ count: 5, pct: 0.5 });
    expect(withExternal(0, 0, 10)).toEqual({ count: 0, pct: 0 });
    // overbooking: count passa da capacidade mas pct trava em 1
    expect(withExternal(8, 5, 10)).toEqual({ count: 13, pct: 1 });
  });
  it("capacity 0 → pct 0 (evita divisão por zero)", () => {
    expect(withExternal(2, 1, 0)).toEqual({ count: 3, pct: 0 });
  });
});

describe("monthsInRange", () => {
  it("lista os meses do intervalo, virando o ano", () => {
    expect(monthsInRange("2026-06-22", "2026-08-05")).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
    expect(monthsInRange("2026-12-20", "2027-01-10")).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
    expect(monthsInRange("2026-06-01", "2026-06-30")).toEqual([{ year: 2026, month: 6 }]);
  });
});

describe("monthGrid", () => {
  it("alinha o 1º dia no dia da semana certo e completa a grade", () => {
    // junho/2026: dia 1 é segunda-feira (getUTCDay = 1)
    const weeks = monthGrid(2026, 6);
    expect(weeks[0][0]).toBeNull(); // domingo vazio
    expect(weeks[0][1]).toBe("2026-06-01"); // segunda
    expect(weeks.flat().filter(Boolean)).toHaveLength(30); // junho tem 30 dias
    expect(weeks[weeks.length - 1].length).toBe(7); // última semana completa
    expect(weeks.flat().filter(Boolean)).toContain("2026-06-30");
  });
});

describe("contrastRatio / relativeLuminance", () => {
  it("bate com os valores canônicos do WCAG", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 2);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    // é simétrico
    expect(contrastRatio(INK_HEX, WHITE_HEX)).toBeCloseTo(contrastRatio(WHITE_HEX, INK_HEX), 5);
  });
});

describe("escala de ocupação (regressão de contraste)", () => {
  it("todo degrau passa 4,5:1 com a cor de texto escolhida", () => {
    for (const step of OCCUPANCY_SCALE) {
      const fg = pickTextColor(step.bg);
      expect(contrastRatio(step.bg, fg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("a rampa antiga (violeta com opacidade) reprovava: nenhuma cor de texto passava", () => {
    // regressão do bug: rgba(93,95,239, 0.92) sobre branco = rgb(105,107,240)
    const violetaMaisEscuro = "#696BF0";
    expect(contrastRatio(violetaMaisEscuro, WHITE_HEX)).toBeLessThan(4.5);
    expect(contrastRatio(violetaMaisEscuro, INK_HEX)).toBeLessThan(4.5);
  });

  it("escolhe o texto pela luminância do fundo, não pelo percentual", () => {
    expect(pickTextColor("#F1F4FA")).toBe(INK_HEX);
    expect(pickTextColor("#29263F")).toBe(WHITE_HEX);
    // o degrau de 60% a 80% já é escuro: texto branco, mesmo com pct abaixo de 0.8
    expect(occupancyStyle(0.65).color).toBe(WHITE_HEX);
    expect(occupancyStyle(0.55).color).toBe(INK_HEX);
  });

  it("mapeia a ocupação em 5 degraus, com clamp nas pontas", () => {
    expect(occupancyStep(0)).toBe(0);
    expect(occupancyStep(0.19)).toBe(0);
    expect(occupancyStep(0.2)).toBe(1);
    expect(occupancyStep(0.4)).toBe(2);
    expect(occupancyStep(0.6)).toBe(3);
    expect(occupancyStep(0.8)).toBe(4);
    expect(occupancyStep(1)).toBe(4);
    expect(occupancyStep(1.5)).toBe(4);
    expect(occupancyStep(-1)).toBe(0);
  });

  it("occupancyStyle devolve o par fundo + texto do degrau", () => {
    expect(occupancyStyle(0.05)).toEqual({ backgroundColor: "#F1F4FA", color: INK_HEX });
    expect(occupancyStyle(1)).toEqual({ backgroundColor: "#29263F", color: WHITE_HEX });
  });
});

describe("formatDayLong / buildDayAriaLabel", () => {
  it("formata o dia por extenso", () => {
    expect(formatDayLong("2026-07-15")).toBe("15 de julho");
    expect(formatDayLong("2026-01-01")).toBe("1 de janeiro");
  });

  it("descreve ocupação, overbooking e bloqueio (nome acessível do botão)", () => {
    expect(buildDayAriaLabel({ date: "2026-07-15", count: 640, capacity: 1100, blocked: false })).toBe(
      "15 de julho, 640 de 1100 vagas ocupadas (58%). Bloquear vendas nesta data",
    );
    expect(
      buildDayAriaLabel({ date: "2026-07-15", count: 1101, capacity: 1100, blocked: false }),
    ).toBe("15 de julho, 1101 de 1100 vagas ocupadas, overbooking. Bloquear vendas nesta data");
    expect(buildDayAriaLabel({ date: "2026-07-15", count: 0, capacity: 10, blocked: true })).toBe(
      "15 de julho, vendas bloqueadas nesta data. Liberar vendas nesta data",
    );
  });

  it("capacidade 0 não vira divisão por zero", () => {
    expect(buildDayAriaLabel({ date: "2026-07-15", count: 0, capacity: 0, blocked: false })).toBe(
      "15 de julho, 0 de 0 vagas ocupadas (0%). Bloquear vendas nesta data",
    );
  });
});
