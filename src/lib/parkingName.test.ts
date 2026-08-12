import { describe, expect, it } from "vitest";
import { parkingTitle } from "./parkingName";

describe("parkingTitle", () => {
  it("empresa com várias unidades: o título diferencia cada uma", () => {
    // O bug que motivou o helper: os três cards da Aerovalet diziam só "Aerovalet".
    expect(parkingTitle("Aerovalet", "Aeroporto de Congonhas")).toBe(
      "Aerovalet · Aeroporto de Congonhas",
    );
    expect(parkingTitle("Aerovalet", "Aeroporto de Guarulhos")).toBe(
      "Aerovalet · Aeroporto de Guarulhos",
    );
    expect(parkingTitle("Aerovalet", "Terminal Rodoviário Tietê")).toBe(
      "Aerovalet · Terminal Rodoviário Tietê",
    );
  });

  it("unidades homônimas de empresas diferentes continuam distinguíveis", () => {
    // "Aeroporto de Congonhas" é da Aerovalet E da Plenty Park; "Lisboa" é de três
    // empresas. Só o nome da unidade apagaria a marca que o cliente compara.
    expect(parkingTitle("Plenty Park", "Aeroporto de Congonhas")).toBe(
      "Plenty Park · Aeroporto de Congonhas",
    );
    expect(parkingTitle("Airpark", "Lisboa")).toBe("Airpark · Lisboa");
    expect(parkingTitle("Redpark", "Lisboa")).toBe("Redpark · Lisboa");
  });

  it("nomes iguais não se repetem", () => {
    expect(parkingTitle("Virapark", "Virapark")).toBe("Virapark");
    expect(parkingTitle("Agência Fera", "Agência Fera")).toBe("Agência Fera");
  });

  it("compara ignorando caixa, acento e espaço extra", () => {
    expect(parkingTitle("Gaita Park", "gaita  park")).toBe("Gaita Park");
    expect(parkingTitle("Agência Fera", "Agencia Fera")).toBe("Agência Fera");
    expect(parkingTitle("Motion Park", " Motion Park ")).toBe("Motion Park");
  });

  it("unidade que já carrega a marca mostra só a unidade", () => {
    expect(parkingTitle("Peu Park", "Peu Park Zumbi dos Palmares")).toBe(
      "Peu Park Zumbi dos Palmares",
    );
  });

  it("marca só é considerada repetida em palavra inteira", () => {
    // "Park" dentro de "Parkopolis" é coincidência de letras, não a marca.
    expect(parkingTitle("Park", "Parkopolis Centro")).toBe("Park · Parkopolis Centro");
  });

  it("com um dos nomes ausente, devolve o que existir", () => {
    expect(parkingTitle("Aerovalet", "")).toBe("Aerovalet");
    expect(parkingTitle("Aerovalet", null)).toBe("Aerovalet");
    expect(parkingTitle(null, "Aeroporto de Congonhas")).toBe("Aeroporto de Congonhas");
    expect(parkingTitle("   ", "Aeroporto de Congonhas")).toBe("Aeroporto de Congonhas");
    expect(parkingTitle(null, undefined)).toBe("");
  });
});
