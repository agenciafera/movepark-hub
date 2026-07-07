import { describe, expect, it } from "vitest";
import {
  flowReducer,
  initialFlowState,
  isValidPlateBR,
  normalizePlate,
  shouldAutoLookup,
  type LookedUpVehicle,
} from "./usePlateLookupFlow.logic";

const vehicle: LookedUpVehicle = {
  license_plate: "EQH1120",
  model: "HONDA/FIT EX FLEX",
  color: "Cinza",
  raw_color: "CINZA",
  brand: "HONDA",
  year: "2010",
  fuel: "ALCOOL / GASOLINA",
};

describe("flowReducer", () => {
  it("LOOKUP_START vai pra looking_up e limpa resultado", () => {
    const s = flowReducer({ status: "found", vehicle, error: null }, { type: "LOOKUP_START" });
    expect(s).toEqual({ status: "looking_up", vehicle: null, error: null });
  });

  it("LOOKUP_FOUND guarda o veículo", () => {
    const s = flowReducer(initialFlowState, { type: "LOOKUP_FOUND", vehicle });
    expect(s).toEqual({ status: "found", vehicle, error: null });
  });

  it("LOOKUP_NOT_FOUND → not_found", () => {
    expect(flowReducer(initialFlowState, { type: "LOOKUP_NOT_FOUND" }).status).toBe("not_found");
  });

  it("LOOKUP_ERROR guarda a mensagem", () => {
    const s = flowReducer(initialFlowState, { type: "LOOKUP_ERROR", message: "boom" });
    expect(s).toEqual({ status: "error", vehicle: null, error: "boom" });
  });

  it("MANUAL → manual e RESET volta ao início", () => {
    expect(flowReducer(initialFlowState, { type: "MANUAL" }).status).toBe("manual");
    const s = flowReducer({ status: "found", vehicle, error: null }, { type: "RESET" });
    expect(s).toEqual(initialFlowState);
  });
});

describe("placa helpers", () => {
  it("normalizePlate tira máscara e sobe maiúscula", () => {
    expect(normalizePlate(" eqh-1120 ")).toBe("EQH1120");
  });

  it("isValidPlateBR aceita antiga e Mercosul", () => {
    expect(isValidPlateBR("ABC1234")).toBe(true);
    expect(isValidPlateBR("ABC1D23")).toBe(true);
    expect(isValidPlateBR("AB1234")).toBe(false);
  });

  it("shouldAutoLookup só dispara ocioso + placa válida", () => {
    expect(shouldAutoLookup("EQH1120", "idle")).toBe(true);
    expect(shouldAutoLookup("EQH112", "idle")).toBe(false); // incompleta
    expect(shouldAutoLookup("EQH1120", "found")).toBe(false); // já resolveu
    expect(shouldAutoLookup("EQH1120", "looking_up")).toBe(false);
  });
});
