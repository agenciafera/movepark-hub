import { describe, expect, it } from "vitest";
import { normalizeWlDomain, wlApiBaseUrl, WL_API_PATH } from "./wl";

describe("normalizeWlDomain", () => {
  it("tira protocolo, path e normaliza caixa", () => {
    expect(normalizeWlDomain("https://ferapark.movepark.com.br/api/v3/backend")).toBe(
      "ferapark.movepark.com.br",
    );
    expect(normalizeWlDomain("FeraPark.Movepark.com.br/")).toBe("ferapark.movepark.com.br");
    expect(normalizeWlDomain("  ferapark.movepark.com.br  ")).toBe("ferapark.movepark.com.br");
  });

  it("vazio → null", () => {
    expect(normalizeWlDomain("")).toBeNull();
    expect(normalizeWlDomain("   ")).toBeNull();
  });
});

describe("wlApiBaseUrl", () => {
  it("monta https://<host><path-fixo>", () => {
    expect(wlApiBaseUrl("ferapark.movepark.com.br")).toBe(
      `https://ferapark.movepark.com.br${WL_API_PATH}`,
    );
    // mesmo se vier com protocolo/path, normaliza
    expect(wlApiBaseUrl("https://ferapark.movepark.com.br/qualquer")).toBe(
      `https://ferapark.movepark.com.br${WL_API_PATH}`,
    );
  });
});
