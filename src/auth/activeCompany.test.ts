import { describe, expect, it } from "vitest";
import { resolveActiveCompanyId } from "./activeCompany";

describe("resolveActiveCompanyId", () => {
  it("uma empresa só: não há empresa ativa, a RLS já recorta", () => {
    expect(resolveActiveCompanyId(["a"], "a", false)).toBeNull();
    expect(resolveActiveCompanyId([], null, false)).toBeNull();
  });

  it("mais de uma: respeita a escolhida no aparelho", () => {
    expect(resolveActiveCompanyId(["a", "b"], "b", false)).toBe("b");
  });

  it("sem escolha guardada, começa pela primeira da lista (a mais antiga no vínculo)", () => {
    expect(resolveActiveCompanyId(["a", "b"], null, false)).toBe("a");
  });

  it("escolha de uma empresa da qual a pessoa saiu cai para a primeira", () => {
    expect(resolveActiveCompanyId(["a", "b"], "c", false)).toBe("a");
  });

  it("hub_admin nunca tem empresa ativa: ele usa a impersonation", () => {
    expect(resolveActiveCompanyId(["a", "b"], "b", true)).toBeNull();
  });
});
