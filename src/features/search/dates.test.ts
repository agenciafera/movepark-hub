import { describe, expect, it } from "vitest";
import { defaultSearchRange, resolveSearchDates } from "./dates";

const NOW = new Date("2026-06-10T15:30:00.000Z");

describe("defaultSearchRange", () => {
  it("retorna amanhã às 10h por 1 diária", () => {
    const { from, to } = defaultSearchRange(NOW);
    const f = new Date(from);
    const t = new Date(to);
    // dia seguinte ao 'now'
    expect(f.getDate()).toBe(new Date(NOW.getTime() + 86400000).getDate());
    expect(f.getHours()).toBe(10);
    // 1 diária
    expect((t.getTime() - f.getTime()) / 86400000).toBe(1);
  });
});

describe("resolveSearchDates", () => {
  it("usa as datas da URL quando ambas presentes", () => {
    const r = resolveSearchDates("2026-07-01T10:00:00Z", "2026-07-05T10:00:00Z", NOW);
    expect(r).toEqual({
      from: "2026-07-01T10:00:00Z",
      to: "2026-07-05T10:00:00Z",
      isEstimate: false,
    });
  });
  it("cai na estimativa quando falta 'from'", () => {
    const r = resolveSearchDates("", "2026-07-05T10:00:00Z", NOW);
    expect(r.isEstimate).toBe(true);
    expect(r.from).toBe(defaultSearchRange(NOW).from);
  });
  it("cai na estimativa quando falta 'to'", () => {
    const r = resolveSearchDates("2026-07-01T10:00:00Z", "", NOW);
    expect(r.isEstimate).toBe(true);
  });
  it("cai na estimativa quando faltam ambas", () => {
    const r = resolveSearchDates("", "", NOW);
    expect(r).toEqual({ ...defaultSearchRange(NOW), isEstimate: true });
  });
});
