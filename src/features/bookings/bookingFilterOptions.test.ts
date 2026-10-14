import { describe, expect, it } from "vitest";
import { addOnOptions, addOnParam, utmOptions, yesNoParam } from "./bookingFilterOptions";

describe("opções dos filtros extras da lista (14/10/2026)", () => {
  it("adicional: as genéricas primeiro, depois os do recorte, sem colidir com os valores reservados", () => {
    expect(addOnOptions(["Capa", "any"]).map((o) => o.value)).toEqual(["all", "any", "none", "Capa"]);
    expect(addOnParam("all")).toBeUndefined();
    expect(addOnParam("none")).toBe("none");
    expect(addOnParam("Capa")).toBe("Capa");
  });

  it("campanha: 'Todas' e as fontes", () => {
    expect(utmOptions(["google", "direct"]).map((o) => o.value)).toEqual(["all", "google", "direct"]);
  });

  it("sim/não do endereço viram booleano; qualquer outra coisa não filtra", () => {
    expect(yesNoParam("sim")).toBe(true);
    expect(yesNoParam("nao")).toBe(false);
    expect(yesNoParam("all")).toBeUndefined();
  });
});
