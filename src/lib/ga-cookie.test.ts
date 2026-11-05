import { describe, expect, it } from "vitest";
import {
  gaIdsFromCookies,
  parseCookies,
  parseGaClientId,
  parseGaSessionId,
} from "@/lib/ga-cookie";

describe("parseGaClientId", () => {
  it("tira o prefixo de versão e profundidade do cookie _ga", () => {
    expect(parseGaClientId("GA1.1.1234567890.1699999999")).toBe("1234567890.1699999999");
    expect(parseGaClientId("GA1.2.55.1699999999")).toBe("55.1699999999");
  });

  it("recusa cookie malformado ou vazio", () => {
    expect(parseGaClientId("")).toBeNull();
    expect(parseGaClientId(null)).toBeNull();
    expect(parseGaClientId("GA1.1.abc")).toBeNull();
    expect(parseGaClientId("GA1.1.<script>.1")).toBeNull();
  });
});

describe("parseGaSessionId", () => {
  it("lê o formato GS1 (terceiro segmento)", () => {
    expect(parseGaSessionId("GS1.1.1699999999.3.1.1699999999.60.0.0")).toBe("1699999999");
  });

  it("lê o formato GS2 (s<id>$o...)", () => {
    expect(parseGaSessionId("GS2.1.s1762300000$o3$g1$t1762300500$j0$l0$h0")).toBe("1762300000");
  });

  it("recusa o que não é cookie de stream", () => {
    expect(parseGaSessionId("GA1.1.1.2")).toBeNull();
    expect(parseGaSessionId("lixo")).toBeNull();
    expect(parseGaSessionId(undefined)).toBeNull();
  });
});

describe("gaIdsFromCookies", () => {
  it("junta client_id e session_id a partir do document.cookie", () => {
    const raw = "foo=bar; _ga=GA1.1.1234567890.1699999999; _ga_ABC123=GS1.1.1762300000.2.1.1762300100.0.0.0";
    expect(gaIdsFromCookies(raw)).toEqual({ client_id: "1234567890.1699999999", session_id: "1762300000" });
  });

  it("sem _ga não manda sessão nenhuma, mesmo com cookie de stream", () => {
    expect(gaIdsFromCookies("_ga_ABC=GS1.1.1.1.1.1.0.0.0")).toEqual({ client_id: null, session_id: null });
  });

  it("parseCookies ignora pedaços sem igual e mantém valor com igual dentro", () => {
    expect(parseCookies("a=1; lixo; b=x=y")).toEqual({ a: "1", b: "x=y" });
  });
});
