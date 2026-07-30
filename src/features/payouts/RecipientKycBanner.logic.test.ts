import { describe, expect, it } from "vitest";
import { resolveKycBannerState } from "./RecipientKycBanner.logic";

const base = {
  status: "pending" as string | null,
  kyc_url: null as string | null,
  last_provider_status: null as string | null,
};

describe("resolveKycBannerState — banner de prova de vida do parceiro", () => {
  it("sem recebedor, não mostra nada", () => {
    expect(resolveKycBannerState(null).kind).toBe("hidden");
    expect(resolveKycBannerState(undefined).kind).toBe("hidden");
  });

  it("em análise no gateway (registration), não pede nada ao parceiro", () => {
    const state = resolveKycBannerState({
      ...base,
      status: "pending",
      last_provider_status: "registration",
    });
    expect(state.kind).toBe("hidden");
  });

  it("com link e action_required, entrega o link", () => {
    const state = resolveKycBannerState({
      status: "action_required",
      kyc_url: "https://check-identity.baas.stone.com.br?token=abc",
      last_provider_status: "affiliation",
    });
    expect(state).toEqual({
      kind: "ready",
      url: "https://check-identity.baas.stone.com.br?token=abc",
    });
  });

  it("gateway já exigiu a prova de vida (affiliation) mas o link ainda não chegou", () => {
    const state = resolveKycBannerState({
      ...base,
      status: "pending",
      last_provider_status: "affiliation",
    });
    expect(state.kind).toBe("preparing");
  });

  it("action_required sem link também cai em preparando", () => {
    const state = resolveKycBannerState({ ...base, status: "action_required" });
    expect(state.kind).toBe("preparing");
  });

  it("kyc_url só com espaços não vale como link", () => {
    const state = resolveKycBannerState({
      status: "action_required",
      kyc_url: "   ",
      last_provider_status: "affiliation",
    });
    expect(state.kind).toBe("preparing");
  });

  it("ficha aprovada não mostra link antigo que ficou na linha", () => {
    // `refresh-recipients` para de pollar quando vira `active`, então o kyc_url fica para trás.
    const state = resolveKycBannerState({
      status: "active",
      kyc_url: "https://check-identity.baas.stone.com.br?token=velho",
      last_provider_status: "active",
    });
    expect(state.kind).toBe("hidden");
  });

  it("recusada não mostra banner", () => {
    const state = resolveKycBannerState({
      ...base,
      status: "refused",
      last_provider_status: "refused",
    });
    expect(state.kind).toBe("hidden");
  });
});
