import { describe, expect, it } from "vitest";
import { activeAccessLink, describeAccessLink, shareMessage } from "./accessLink.logic";

const fmt = (iso: string) => `[${iso}]`;

describe("describeAccessLink", () => {
  it("link nunca aberto", () => {
    expect(
      describeAccessLink({ email: "a@b.co", created_at: "c", revoked_at: null, last_used_at: null, use_count: 0 }, fmt),
    ).toBe("Gerado em [c] para a@b.co. Ainda não foi aberto.");
  });
  it("aberto uma vez e várias vezes", () => {
    const base = { email: "a@b.co", created_at: "c", revoked_at: null };
    expect(describeAccessLink({ ...base, last_used_at: "u", use_count: 1 }, fmt)).toContain("Aberto 1 vez, a última em [u].");
    expect(describeAccessLink({ ...base, last_used_at: "u", use_count: 3 }, fmt)).toContain("Aberto 3 vezes");
  });
});

describe("activeAccessLink", () => {
  it("ignora os revogados e devolve o primeiro vivo", () => {
    const revogado = { email: "x", created_at: "1", revoked_at: "r", last_used_at: null, use_count: 0 };
    const vivo = { email: "y", created_at: "2", revoked_at: null, last_used_at: null, use_count: 0 };
    expect(activeAccessLink([revogado, vivo])).toBe(vivo);
    expect(activeAccessLink([revogado])).toBeNull();
    expect(activeAccessLink(undefined)).toBeNull();
  });
});

describe("shareMessage", () => {
  it("leva o nome da empresa e a URL, sem travessão", () => {
    const m = shareMessage("BePark", "https://movepark.co/acesso/x");
    expect(m).toContain("BePark");
    expect(m).toContain("https://movepark.co/acesso/x");
    expect(m).not.toMatch(/[–—]/);
  });
});
