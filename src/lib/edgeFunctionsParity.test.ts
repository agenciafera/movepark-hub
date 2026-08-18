import { describe, expect, it } from "vitest";

// Import atravessando a fronteira para `scripts/`, no mesmo padrão do `sitemapSplit.test.ts`:
// a lógica é de tooling e roda no `node`, mas sem teste o guard que protege a paridade entre o
// repo e a produção seria a única peça sem cobertura. Declaração de tipo em
// `scripts/edge-functions-parity.logic.d.mts`. O porquê do guard está em docs/specs/public-api.md §14.
import { compararParidade } from "../../scripts/edge-functions-parity.logic.mjs";

describe("paridade das Edge Functions", () => {
  it("não acha nada quando os dois lados batem", () => {
    const r = compararParidade({
      publicadas: ["api", "mcp"],
      pastas: ["api", "mcp"],
      declaradas: ["api", "mcp"],
    });
    expect(r.ok).toBe(true);
    expect(r.soEmProducao).toEqual([]);
    expect(r.esquecidas).toEqual([]);
  });

  it("acusa publicada sem fonte no repo (o caso simulate-price)", () => {
    // Rodou dois meses em produção sem estar no git, escondendo defeito de preço.
    const r = compararParidade({ publicadas: ["api", "simulate-price"], pastas: ["api"] });
    expect(r.soEmProducao).toEqual(["simulate-price"]);
    expect(r.ok).toBe(false);
  });

  it("acusa no repo e nunca publicada (o caso submit-contact-message)", () => {
    // Estava no git, com teste, e o formulário batia num 404 para todo visitante.
    const r = compararParidade({ publicadas: ["api"], pastas: ["api", "submit-contact-message"] });
    expect(r.esquecidas).toEqual(["submit-contact-message"]);
    expect(r.ok).toBe(false);
  });

  it("acusa bloco do config.toml sem pasta, que é o sintoma visível sem token", () => {
    const r = compararParidade({ pastas: ["api"], declaradas: ["api", "simulate-price"] });
    expect(r.declaradasSemPasta).toEqual(["simulate-price"]);
    expect(r.ok).toBe(false);
  });

  it("pendência declarada é reportada, mas não reprova", () => {
    const r = compararParidade({
      publicadas: ["api"],
      pastas: ["api", "google-place-refresh"],
      pendentes: { "google-place-refresh": "depende da chave do Places" },
    });
    expect(r.esquecidas).toEqual([]);
    expect(r.pendentesAtivas).toEqual(["google-place-refresh"]);
    expect(r.ok).toBe(true);
  });

  it("a allowlist não guarda quem já subiu", () => {
    // Senão a justificativa envelhece e o guard passa a mentir sobre o que está no ar.
    const r = compararParidade({
      publicadas: ["api", "google-place-refresh"],
      pastas: ["api", "google-place-refresh"],
      pendentes: { "google-place-refresh": "depende da chave do Places" },
    });
    expect(r.pendentesObsoletas).toEqual(["google-place-refresh"]);
    expect(r.ok).toBe(false);
  });

  it("pendência declarada não esconde uma órfã do outro sentido", () => {
    const r = compararParidade({
      publicadas: ["orfa"],
      pastas: ["google-place-refresh"],
      pendentes: { "google-place-refresh": "motivo" },
    });
    expect(r.soEmProducao).toEqual(["orfa"]);
    expect(r.ok).toBe(false);
  });

  it("ordena os achados, para o alarme não mudar de forma a cada leitura", () => {
    const r = compararParidade({ publicadas: ["zeta", "alfa"], pastas: [] });
    expect(r.soEmProducao).toEqual(["alfa", "zeta"]);
  });

  it("listas vazias não são falha", () => {
    expect(compararParidade({}).ok).toBe(true);
  });
});
