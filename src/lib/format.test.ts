import { describe, expect, it } from "vitest";
import {
  daysBetween,
  formatBRL,
  formatDate,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatRating,
  formatTime,
} from "./format";

// Intl insere espaços especiais (U+00A0 / U+202F) — normaliza pra asserção estável.
const norm = (s: string) => s.replace(/[\u00A0\u202F]/g, " ");

describe("formatBRL", () => {
  it("retorna — para null/undefined/NaN", () => {
    expect(formatBRL(null)).toBe("—");
    expect(formatBRL(undefined)).toBe("—");
    expect(formatBRL(Number.NaN)).toBe("—");
  });
  it("formata em BRL com vírgula decimal", () => {
    expect(norm(formatBRL(30.9))).toBe("R$ 30,90");
    expect(norm(formatBRL(0))).toBe("R$ 0,00");
    expect(norm(formatBRL(1234.5))).toBe("R$ 1.234,50");
  });
});

describe("formatDate / formatDateTime / formatTime", () => {
  // Datas locais (construtor com componentes) — independentes de timezone.
  const d = new Date(2026, 5, 10, 14, 30); // 10/06/2026 14:30 local
  it("formata data", () => {
    expect(formatDate(d)).toBe("10/06/2026");
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
  it("formata data e hora", () => {
    expect(formatDateTime(d)).toBe("10/06/2026 14:30");
    expect(formatDateTime("")).toBe("—");
  });
  it("formata hora", () => {
    expect(formatTime(d)).toBe("14:30");
    expect(formatTime(null)).toBe("—");
  });
});

describe("daysBetween", () => {
  it("conta dias inteiros", () => {
    expect(daysBetween(new Date(2026, 5, 10), new Date(2026, 5, 15))).toBe(5);
  });
  it("piso de 1 dia (mesmo instante)", () => {
    const x = new Date(2026, 5, 10, 8, 0);
    expect(daysBetween(x, x)).toBe(1);
  });
  it("arredonda fração pra cima", () => {
    expect(daysBetween(new Date(2026, 5, 10, 0, 0), new Date(2026, 5, 11, 12, 0))).toBe(2);
  });
});

describe("formatDistance", () => {
  it("retorna — para inválidos", () => {
    expect(formatDistance(null)).toBe("—");
    expect(formatDistance(Number.NaN)).toBe("—");
  });
  it("usa metros abaixo de 1 km", () => {
    expect(formatDistance(0.4)).toBe("400 m");
    expect(formatDistance(0)).toBe("0 m");
  });
  it("usa km com 1 casa a partir de 1 km", () => {
    expect(norm(formatDistance(1))).toBe("1 km");
    expect(norm(formatDistance(2.5))).toBe("2,5 km");
  });
});

describe("formatDuration", () => {
  it("retorna — sem datas ou duração não-positiva", () => {
    expect(formatDuration(null, null)).toBe("—");
    expect(formatDuration(new Date(2026, 5, 10), new Date(2026, 5, 10))).toBe("—");
  });
  it("só horas quando < 1 dia", () => {
    expect(formatDuration(new Date(2026, 5, 10, 0), new Date(2026, 5, 10, 1))).toBe("1 hora");
    expect(formatDuration(new Date(2026, 5, 10, 0), new Date(2026, 5, 10, 5))).toBe("5 horas");
  });
  it("dias e dias+horas", () => {
    expect(formatDuration(new Date(2026, 5, 10, 0), new Date(2026, 5, 15, 0))).toBe("5 dias");
    expect(formatDuration(new Date(2026, 5, 10, 0), new Date(2026, 5, 11, 0))).toBe("1 dia");
    expect(formatDuration(new Date(2026, 5, 10, 0), new Date(2026, 5, 12, 4))).toBe("2 dias e 4h");
  });
});

describe("formatRating", () => {
  it("retorna — para inválidos", () => {
    expect(formatRating(null)).toBe("—");
    expect(formatRating(Number.NaN)).toBe("—");
  });
  it("usa vírgula com 1-2 casas", () => {
    expect(formatRating(4)).toBe("4,0");
    expect(formatRating(4.8)).toBe("4,8");
    expect(formatRating(4.81)).toBe("4,81");
  });
});
