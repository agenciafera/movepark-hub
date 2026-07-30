import { describe, expect, it } from "vitest";
import {
  formatKycCountdown,
  kycMsRemaining,
  resolveKycBannerState,
} from "./RecipientKycBanner.logic";

const NOW = new Date("2026-07-30T20:30:00Z");
const VIVO = "2026-07-30T20:46:41Z";
const MORTO = "2026-07-30T20:10:00Z";
const URL = "https://check-identity.baas.stone.com.br?token=abc";

const base = {
  status: "pending" as string | null,
  kyc_url: null as string | null,
  kyc_url_expires_at: null as string | null,
  last_provider_status: null as string | null,
};

describe("resolveKycBannerState — banner de prova de vida do parceiro", () => {
  it("sem recebedor, não mostra nada", () => {
    expect(resolveKycBannerState(null, NOW).kind).toBe("hidden");
    expect(resolveKycBannerState(undefined, NOW).kind).toBe("hidden");
  });

  it("em análise no gateway (registration), não pede nada ao parceiro", () => {
    const s = resolveKycBannerState({ ...base, last_provider_status: "registration" }, NOW);
    expect(s.kind).toBe("hidden");
  });

  it("link com validade no futuro entrega o link e a validade", () => {
    const s = resolveKycBannerState(
      {
        status: "action_required",
        kyc_url: URL,
        kyc_url_expires_at: VIVO,
        last_provider_status: "affiliation",
      },
      NOW,
    );
    expect(s).toEqual({ kind: "ready", url: URL, expiresAt: VIVO });
  });

  it("link com validade no passado vira expirado", () => {
    const s = resolveKycBannerState(
      {
        status: "action_required",
        kyc_url: URL,
        kyc_url_expires_at: MORTO,
        last_provider_status: "affiliation",
      },
      NOW,
    );
    expect(s.kind).toBe("expired");
  });

  it("link sem validade conhecida vira expirado, não ready", () => {
    // Melhor oferecer um link novo do que mandar a pessoa tentar um que talvez já morreu.
    const s = resolveKycBannerState(
      { status: "action_required", kyc_url: URL, kyc_url_expires_at: null, last_provider_status: "affiliation" },
      NOW,
    );
    expect(s.kind).toBe("expired");
  });

  it("validade ilegível também cai em expirado", () => {
    const s = resolveKycBannerState(
      { status: "action_required", kyc_url: URL, kyc_url_expires_at: "qualquer coisa", last_provider_status: "affiliation" },
      NOW,
    );
    expect(s.kind).toBe("expired");
  });

  it("gateway exigiu a prova de vida mas nenhum link foi emitido", () => {
    const s = resolveKycBannerState({ ...base, last_provider_status: "affiliation" }, NOW);
    expect(s.kind).toBe("preparing");
  });

  it("kyc_url só com espaços não vale como link", () => {
    const s = resolveKycBannerState(
      { status: "action_required", kyc_url: "   ", kyc_url_expires_at: VIVO, last_provider_status: "affiliation" },
      NOW,
    );
    expect(s.kind).toBe("preparing");
  });

  it("ficha aprovada não mostra link antigo que ficou na linha", () => {
    const s = resolveKycBannerState(
      { status: "active", kyc_url: URL, kyc_url_expires_at: VIVO, last_provider_status: "active" },
      NOW,
    );
    expect(s.kind).toBe("hidden");
  });

  it("recusada não mostra banner", () => {
    const s = resolveKycBannerState(
      { ...base, status: "refused", last_provider_status: "refused" },
      NOW,
    );
    expect(s.kind).toBe("hidden");
  });
});

describe("kycMsRemaining", () => {
  it("conta o que falta", () => {
    expect(kycMsRemaining(VIVO, NOW)).toBe(16 * 60_000 + 41_000);
  });

  it("nunca devolve negativo", () => {
    expect(kycMsRemaining(MORTO, NOW)).toBe(0);
  });

  it("data ilegível vira zero", () => {
    expect(kycMsRemaining("nada disso", NOW)).toBe(0);
  });
});

describe("formatKycCountdown", () => {
  it("formata mm:ss com zero à esquerda", () => {
    expect(formatKycCountdown(20 * 60_000)).toBe("20:00");
    expect(formatKycCountdown(9 * 60_000 + 5_000)).toBe("09:05");
    expect(formatKycCountdown(59_000)).toBe("00:59");
    expect(formatKycCountdown(0)).toBe("00:00");
  });

  it("negativo satura em zero", () => {
    expect(formatKycCountdown(-5_000)).toBe("00:00");
  });
});
