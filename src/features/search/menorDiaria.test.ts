import { describe, it, expect } from "vitest";
import { mapLowestDaily, rotuloDaDiaria, type LowestDailyRow } from "./menorDiaria";

const linha = (over: Partial<LowestDailyRow> = {}): LowestDailyRow => ({
  location_parking_type_id: "lpt-1",
  days: 7,
  total: "174.30",
  old_total: null,
  daily: "24.90",
  min_stay_days: null,
  ...over,
});

describe("mapLowestDaily", () => {
  it("converte o numérico que o PostgREST manda como string", () => {
    const map = mapLowestDaily([linha()]);
    expect(map.get("lpt-1")).toEqual({
      total: 174.3,
      oldTotal: null,
      daily: 24.9,
      days: 7,
      minStayDays: null,
    });
  });

  it("guarda o balcão só quando ele é maior que o preço", () => {
    expect(mapLowestDaily([linha({ old_total: "280.00" })]).get("lpt-1")?.oldTotal).toBe(280);
    expect(mapLowestDaily([linha({ old_total: "174.30" })]).get("lpt-1")?.oldTotal).toBeNull();
    expect(mapLowestDaily([linha({ old_total: "100.00" })]).get("lpt-1")?.oldTotal).toBeNull();
  });

  it("descarta a linha sem preço em vez de mostrar zero no card", () => {
    expect(mapLowestDaily([linha({ total: null, daily: null })]).size).toBe(0);
    expect(mapLowestDaily([linha({ total: "0", daily: "0" })]).size).toBe(0);
  });

  it("estadia mínima de uma diária não é exigência", () => {
    expect(mapLowestDaily([linha({ min_stay_days: 1 })]).get("lpt-1")?.minStayDays).toBeNull();
    expect(mapLowestDaily([linha({ min_stay_days: 3 })]).get("lpt-1")?.minStayDays).toBe(3);
  });

  it("sem linhas devolve mapa vazio", () => {
    expect(mapLowestDaily(null).size).toBe(0);
    expect(mapLowestDaily(undefined).size).toBe(0);
  });
});

describe("rotuloDaDiaria", () => {
  it("diz a duração em que a diária vale", () => {
    expect(rotuloDaDiaria(7)).toBe("por diária na estadia de 7 dias");
    expect(rotuloDaDiaria(30)).toBe("por diária na estadia de 30 dias");
  });

  it("uma diária não precisa de condição", () => {
    expect(rotuloDaDiaria(1)).toBe("por diária");
  });
});
