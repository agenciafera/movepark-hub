import { describe, expect, it } from "vitest";
import {
  defaultSearchDates,
  defaultSearchRange,
  resolveSearchDates,
  stretchParamsToMinStay,
} from "./dates";

const NOW = new Date("2026-06-10T15:30:00.000Z");

describe("defaultSearchRange", () => {
  it("retorna amanhã às 22h, saindo às 8h cinco dias depois", () => {
    const { from, to } = defaultSearchRange(NOW);
    const f = new Date(from);
    const t = new Date(to);
    // dia seguinte ao 'now'
    expect(f.getDate()).toBe(new Date(NOW.getTime() + 86400000).getDate());
    expect(f.getHours()).toBe(22);
    expect(t.getHours()).toBe(8);
    // 4 dias e 10 horas
    expect((t.getTime() - f.getTime()) / 3600000).toBe(4 * 24 + 10);
  });

  /**
   * A barra de busca e a lista de resultados respondiam a mesma pergunta com números
   * diferentes: a barra propunha amanhã 22h por 5 diárias e a lista buscava amanhã 10h por 1.
   * Em `/search` sem datas o cliente lia um período no topo e recebia o resultado de outro, e
   * clicar na lupa sem mexer em nada saltava de 8 para 18 vagas, porque as 10 que somem têm
   * estadia mínima de 2 ou 3 diárias e não vendem uma noite. Fonte única aqui.
   */
  it("é a mesma janela que a barra de busca propõe", () => {
    const pill = defaultSearchDates(NOW);
    const lista = defaultSearchRange(NOW);
    expect(pill.from.toISOString()).toBe(lista.from);
    expect(pill.to.toISOString()).toBe(lista.to);
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
