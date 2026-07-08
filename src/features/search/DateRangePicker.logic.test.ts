import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { mergeRange, fmtTime } from "./DateRangePicker.logic";

const hhmm = (d: Date | null) => (d ? format(d, "dd/MM HH:mm") : null);

describe("mergeRange", () => {
  it("range vazio limpa from e to", () => {
    const r = mergeRange({ from: new Date(2026, 6, 8), to: new Date(2026, 6, 10) }, undefined);
    expect(r).toEqual({ from: null, to: null });
  });

  it("só check-in: usa 08:00 default e mantém check-out vazio", () => {
    const r = mergeRange({ from: null, to: null }, { from: new Date(2026, 6, 8) });
    expect(hhmm(r.from)).toBe("08/07 08:00");
    expect(r.to).toBeNull();
  });

  it("range completo: check-out usa 18:00 default", () => {
    const r = mergeRange(
      { from: null, to: null },
      { from: new Date(2026, 6, 8), to: new Date(2026, 6, 12) },
    );
    expect(hhmm(r.from)).toBe("08/07 08:00");
    expect(hhmm(r.to)).toBe("12/07 18:00");
  });

  it("preserva os horários já escolhidos ao reselecionar as datas", () => {
    const prev = { from: new Date(2026, 6, 8, 22, 30), to: new Date(2026, 6, 12, 9, 0) };
    const r = mergeRange(prev, { from: new Date(2026, 6, 9), to: new Date(2026, 6, 14) });
    expect(hhmm(r.from)).toBe("09/07 22:30");
    expect(hhmm(r.to)).toBe("14/07 09:00");
  });
});

describe("fmtTime", () => {
  it("usa o fallback quando a data é nula", () => {
    expect(fmtTime(null)).toBe("08:00");
    expect(fmtTime(null, "18:00")).toBe("18:00");
  });
  it("formata HH:mm da data", () => {
    expect(fmtTime(new Date(2026, 6, 8, 22, 5))).toBe("22:05");
  });
});
