import { describe, expect, it } from "vitest";
import {
  brDateToIso,
  cepMask,
  cnpjMask,
  cpfMask,
  dateMask,
  onlyDigits,
  phoneMask,
  splitPhone,
} from "./masks";

describe("masks", () => {
  it("cnpjMask formata progressivamente", () => {
    expect(cnpjMask("11222333000181")).toBe("11.222.333/0001-81");
    expect(cnpjMask("112")).toBe("11.2");
    expect(cnpjMask("11222333000181999")).toBe("11.222.333/0001-81"); // trunca em 14
  });

  it("cpfMask formata progressivamente", () => {
    expect(cpfMask("39053344705")).toBe("390.533.447-05");
    expect(cpfMask("3905")).toBe("390.5");
  });

  it("cepMask formata 00000-000", () => {
    expect(cepMask("01310930")).toBe("01310-930");
    expect(cepMask("013")).toBe("013");
  });

  it("phoneMask formata fixo e celular", () => {
    expect(phoneMask("1133334444")).toBe("(11) 3333-4444");
    expect(phoneMask("11999998888")).toBe("(11) 99999-8888");
  });

  it("splitPhone separa DDD e número", () => {
    expect(splitPhone("(11) 99999-8888")).toEqual({ ddd: "11", number: "999998888" });
  });

  it("dateMask formata DD/MM/AAAA", () => {
    expect(dateMask("12101995")).toBe("12/10/1995");
    expect(dateMask("1210")).toBe("12/10");
  });

  it("brDateToIso converte ou retorna null se incompleta", () => {
    expect(brDateToIso("12/10/1995")).toBe("1995-10-12");
    expect(brDateToIso("12/10")).toBeNull();
  });

  it("onlyDigits remove não-dígitos", () => {
    expect(onlyDigits("11.222/0001-81")).toBe("11222000181");
  });
});
