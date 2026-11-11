import { describe, expect, it } from "vitest";
import {
  addOnOptions,
  addOnParam,
  countActiveFilters,
  utmOptions,
  yesNoParam,
} from "./bookingFilterOptions";

describe("opções dos filtros extras da lista (14/10/2026)", () => {
  it("adicional: as genéricas primeiro, depois os do recorte, sem colidir com os valores reservados", () => {
    expect(addOnOptions(["Capa", "any"]).map((o) => o.value)).toEqual([
      "all",
      "any",
      "none",
      "Capa",
    ]);
    expect(addOnParam("all")).toBeUndefined();
    expect(addOnParam("none")).toBe("none");
    expect(addOnParam("Capa")).toBe("Capa");
  });

  it("campanha: 'Todas' e as fontes", () => {
    expect(utmOptions(["google", "direct"]).map((o) => o.value)).toEqual([
      "all",
      "google",
      "direct",
    ]);
  });

  it("sim/não do endereço viram booleano; qualquer outra coisa não filtra", () => {
    expect(yesNoParam("sim")).toBe(true);
    expect(yesNoParam("nao")).toBe(false);
    expect(yesNoParam("all")).toBeUndefined();
  });

  it("conta só os filtros de 'Mais filtros' ligados, e só nas chaves pedidas (11/11/2026)", () => {
    const f = {
      status: "cancelled",
      pcd: "sim",
      adicional: "all",
      campanha: "google",
      afiliado: "nao",
    };
    expect(countActiveFilters(f)).toBe(3);
    // Sem white-label o afiliado não aparece, então não conta.
    expect(countActiveFilters(f, ["pcd", "adicional", "campanha", "placa"])).toBe(2);
    expect(countActiveFilters({ status: "all" })).toBe(0);
  });
});
