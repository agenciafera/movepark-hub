import { describe, expect, it } from "vitest";
import { defaultSearchRange, resolveSearchDates, stretchParamsToMinStay } from "./dates";

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

describe("stretchParamsToMinStay", () => {
  const win = () =>
    new URLSearchParams({
      dest: "CWB",
      from: "2026-08-19T12:00:00.000Z",
      to: "2026-08-21T12:00:00.000Z", // 2 diárias
    });

  it("estica o check-out até a estadia mínima do lote", () => {
    const r = stretchParamsToMinStay(win(), 3);
    expect(r.get("from")).toBe("2026-08-19T12:00:00.000Z");
    expect(r.get("to")).toBe("2026-08-22T12:00:00.000Z");
    expect(r.get("dest")).toBe("CWB");
  });

  it("não mexe quando a janela já cobre o mínimo", () => {
    expect(stretchParamsToMinStay(win(), 2).get("to")).toBe("2026-08-21T12:00:00.000Z");
    expect(stretchParamsToMinStay(win(), 1).get("to")).toBe("2026-08-21T12:00:00.000Z");
  });

  it("sem mínimo, devolve os params como vieram", () => {
    const p = win();
    expect(stretchParamsToMinStay(p, null)).toBe(p);
    expect(stretchParamsToMinStay(p, undefined)).toBe(p);
    expect(stretchParamsToMinStay(p, 0)).toBe(p);
  });

  it("datas ausentes ou ilegíveis não viram link quebrado", () => {
    const semDatas = new URLSearchParams({ dest: "CWB" });
    expect(stretchParamsToMinStay(semDatas, 3)).toBe(semDatas);
    const lixo = new URLSearchParams({ from: "amanhã", to: "depois" });
    expect(stretchParamsToMinStay(lixo, 3)).toBe(lixo);
  });

  it("não altera o objeto recebido", () => {
    const p = win();
    stretchParamsToMinStay(p, 5);
    expect(p.get("to")).toBe("2026-08-21T12:00:00.000Z");
  });
});
