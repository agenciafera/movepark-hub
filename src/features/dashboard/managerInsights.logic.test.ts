import { describe, expect, it } from "vitest";
import {
  concentration,
  dominantStay,
  networkInsight,
  rankDetail,
  rankLocations,
  share,
  shortStayShare,
  stayBars,
  type RankedLocation,
} from "./managerInsights.logic";

const loc = (over: Partial<RankedLocation> & { id: string; name: string }): RankedLocation => ({
  company_name: over.name,
  bookings: 0,
  revenue: 0,
  vehicle_days: 0,
  ...over,
});

const rows: RankedLocation[] = [
  loc({ id: "1", name: "Virapark", bookings: 12, revenue: 919.3, vehicle_days: 23 }),
  loc({ id: "2", name: "Motion Park", bookings: 33, revenue: 521.1, vehicle_days: 66 }),
  loc({ id: "3", name: "Afonso Pena", company_name: "Abbapark", bookings: 3 }),
  loc({ id: "4", name: "Garageinn" }),
];
const TOTAL = 1440.4;

describe("share", () => {
  it("arredonda e não divide por zero", () => {
    expect(share(919.3, 1440.4)).toBe(64);
    expect(share(5, 0)).toBe(0);
  });
});

describe("concentration", () => {
  it("mede a participação da líder e quantas unidades somam 80%", () => {
    const c = concentration(rows, TOTAL);
    expect(c.leader?.name).toBe("Virapark");
    expect(c.topShare).toBe(64);
    expect(c.withRevenue).toBe(2);
    // Virapark sozinha é 64%; com a Motion Park passa de 80%.
    expect(c.headCount).toBe(2);
  });

  it("rede sem receita não inventa líder", () => {
    expect(concentration([loc({ id: "1", name: "X" })], 0)).toEqual({
      topShare: 0,
      leader: null,
      headCount: 0,
      withRevenue: 0,
    });
  });
});

describe("rankLocations", () => {
  it("ordena por receita e mede a barra contra a líder, não contra o total", () => {
    const r = rankLocations(rows, TOTAL);
    expect(r.map((x) => x.name)).toEqual(["Virapark", "Motion Park", "Afonso Pena", "Garageinn"]);
    expect(r[0]).toMatchObject({ position: 1, width: "100%" });
    // 521,10 / 919,30 = 57% da líder (não 36% do total).
    expect(r[1].width).toBe("57%");
  });

  it("unidade sem receita entra na lista com barra zerada", () => {
    const r = rankLocations(rows, TOTAL);
    expect(r[3]).toMatchObject({ name: "Garageinn", width: "0%", share: 0 });
  });

  it("empate de receita cai pro volume e depois pro nome", () => {
    const r = rankLocations(
      [loc({ id: "b", name: "Beta", bookings: 1 }), loc({ id: "a", name: "Alfa", bookings: 1 })],
      0,
    );
    expect(r.map((x) => x.name)).toEqual(["Alfa", "Beta"]);
  });
});

describe("rankDetail", () => {
  it("unidade parada diz que está parada", () => {
    expect(rankDetail(rows[3])).toBe("Garageinn · sem reservas no período");
  });

  it("unidade com volume mostra empresa, reservas e diárias", () => {
    expect(rankDetail(rows[0])).toBe("Virapark · 12 reservas · 23 diárias");
  });

  it("singular acompanha o número", () => {
    expect(rankDetail(loc({ id: "x", name: "Uno", bookings: 1, vehicle_days: 1 }))).toBe(
      "Uno · 1 reserva · 1 diária",
    );
  });
});

describe("stayBars / dominantStay / shortStayShare", () => {
  const stay = [
    { sort: 1, bookings: 6 },
    { sort: 2, bookings: 44 },
    { sort: 3, bookings: 1 },
  ];

  it("sempre devolve as seis faixas, mesmo as vazias", () => {
    const bars = stayBars(stay);
    expect(bars).toHaveLength(6);
    expect(bars.map((b) => b.bookings)).toEqual([6, 44, 1, 0, 0, 0]);
    // O buraco na distribuição é informação: a faixa vazia fica na lista.
    expect(bars[5]).toMatchObject({ label: "30 ou mais", width: "0%" });
  });

  it("a barra é medida contra a faixa mais cheia", () => {
    const bars = stayBars(stay);
    expect(bars[1]).toMatchObject({ width: "100%", top: true });
    expect(bars[0].width).toBe("14%");
    // Faixa com pouquíssimo volume ainda desenha um traço visível.
    expect(bars[2].width).toBe("2%");
  });

  it("aponta a faixa dominante e o quanto fica até 3 diárias", () => {
    expect(dominantStay(stay)?.label).toBe("2 a 3");
    expect(shortStayShare(stay)).toBe(98);
    expect(dominantStay([])).toBeNull();
    expect(shortStayShare([])).toBe(0);
  });
});

describe("networkInsight", () => {
  const conc = concentration(rows, TOTAL);
  const base = {
    revenue: TOTAL,
    network: { locations_total: 30, locations_with_revenue: 2 },
    concentration: conc,
    customers: { new: 6, returning: 45 },
  };

  it("rede sem unidade ativa não gera leitura", () => {
    expect(
      networkInsight({ ...base, network: { locations_total: 0, locations_with_revenue: 0 } }),
    ).toBeNull();
  });

  it("rede parada é a leitura mais urgente", () => {
    const i = networkInsight({
      ...base,
      revenue: 0,
      network: { locations_total: 30, locations_with_revenue: 0 },
    });
    expect(i?.title).toBe("Nenhuma unidade gerou receita no período");
  });

  it("receita presa numa unidade vira a leitura, com o risco explícito", () => {
    const i = networkInsight(base);
    expect(i?.title).toBe("Virapark sozinha faz 6 de cada 10 reais da rede");
    expect(i?.detail).toContain("2 de 30 unidades geraram receita");
    expect(i?.detail).toContain("derruba o período inteiro");
  });

  it("rede espalhada com muita unidade parada troca a leitura", () => {
    const espalhada = [
      loc({ id: "1", name: "A", bookings: 5, revenue: 300 }),
      loc({ id: "2", name: "B", bookings: 5, revenue: 300 }),
      loc({ id: "3", name: "C", bookings: 5, revenue: 300 }),
    ];
    const i = networkInsight({
      revenue: 900,
      network: { locations_total: 10, locations_with_revenue: 3 },
      concentration: concentration(espalhada, 900),
      customers: { new: 5, returning: 5 },
    });
    expect(i?.title).toBe("7 de 10 unidades ficaram sem nenhuma reserva paga");
  });

  /** A frase evita o "não é X, é Y" que a regra de escrita do projeto proíbe. */
  it("recompra alta vira leitura de crescimento, sem a construção antitética", () => {
    const espalhada = [
      loc({ id: "1", name: "A", bookings: 5, revenue: 300 }),
      loc({ id: "2", name: "B", bookings: 5, revenue: 300 }),
      loc({ id: "3", name: "C", bookings: 5, revenue: 300 }),
      loc({ id: "4", name: "D", bookings: 5, revenue: 300 }),
    ];
    const i = networkInsight({
      revenue: 1200,
      network: { locations_total: 5, locations_with_revenue: 4 },
      concentration: concentration(espalhada, 1200),
      customers: { new: 3, returning: 45 },
    });
    expect(i?.title).toBe("A rede está crescendo por recompra");
    expect(i?.title).not.toMatch(/não/);
    expect(i?.detail).toContain("94%");
  });
});
