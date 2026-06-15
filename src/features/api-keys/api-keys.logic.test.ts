import { describe, expect, it } from "vitest";
import {
  buildApiKeyCreateArgs,
  EMPTY_API_KEY_FORM,
  groupScopesByModule,
  lastUsedLabel,
  statusLabel,
  validateApiKeyForm,
  type ApiKeyFormValues,
  type ApiScope,
} from "./api-keys.logic";

const base: ApiKeyFormValues = { ...EMPTY_API_KEY_FORM, name: "WPS", scopes: ["locations:read"] };

describe("validateApiKeyForm", () => {
  it("exige nome", () => {
    expect(validateApiKeyForm({ ...base, name: "  " })).toMatch(/nome/i);
  });
  it("exige ao menos um escopo", () => {
    expect(validateApiKeyForm({ ...base, scopes: [] })).toMatch(/escopo/i);
  });
  it("rejeita ambiente inválido", () => {
    expect(validateApiKeyForm({ ...base, environment: "prod" as never })).toMatch(/ambiente/i);
  });
  it("aceita form válido", () => {
    expect(validateApiKeyForm(base)).toBeNull();
  });
});

describe("buildApiKeyCreateArgs", () => {
  it("monta os args da RPC e converte a expiração", () => {
    const args = buildApiKeyCreateArgs("c-1", { ...base, expires_at: "2027-01-31" });
    expect(args).toEqual({
      p_company_id: "c-1",
      p_name: "WPS",
      p_environment: "live",
      p_scopes: ["locations:read"],
      p_expires_at: "2027-01-31T23:59:59",
    });
  });
  it("expiração vazia → null", () => {
    expect(buildApiKeyCreateArgs("c-1", base).p_expires_at).toBeNull();
  });
});

describe("groupScopesByModule", () => {
  it("agrupa por módulo", () => {
    const scopes: ApiScope[] = [
      { scope: "locations:read", module: "locations", description: "" },
      { scope: "locations:write", module: "locations", description: "" },
      { scope: "bookings:read", module: "bookings", description: "" },
    ];
    const g = groupScopesByModule(scopes);
    expect(Object.keys(g)).toEqual(["locations", "bookings"]);
    expect(g.locations).toHaveLength(2);
  });
});

describe("rótulos", () => {
  it("statusLabel traduz", () => {
    expect(statusLabel("active")).toBe("Ativa");
    expect(statusLabel("revoked")).toBe("Revogada");
    expect(statusLabel("expired")).toBe("Expirada");
  });
  it("lastUsedLabel: nunca usada vs data recortada", () => {
    expect(lastUsedLabel(null)).toBe("Nunca usada");
    expect(lastUsedLabel("2026-06-15T10:00:00Z")).toBe("2026-06-15");
  });
});
