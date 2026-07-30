import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Inventário de cobertura das Edge Functions.
 *
 * Mora aqui, no Vitest, e não junto das functions, porque o `deno test` só
 * enxerga o que já tem arquivo de teste: uma function sem teste nenhum é
 * exatamente o caso que ele não consegue reprovar. O guard precisa rodar em
 * quem lista o diretório, não em quem executa os testes.
 *
 * A lista é o placar da Fase 2 do plano de cobertura. Só encolhe: ao escrever
 * o teste de uma function, remova o nome daqui no mesmo commit.
 */

const FUNCTIONS = join(process.cwd(), "supabase", "functions");

/** Edge Functions ainda sem nenhum teste. Só encolhe. */
const SEM_TESTE = [
  "accept-terms",
  "approve-partner",
  "capture-partner-lead",
  "create-booking",
  "get-payment-config",
  "knowledge-search",
  "mock-payment",
  "reconcile-confirmations",
  "redeem-checkout-handoff",
  "refresh-recipients",
  "wl-sync",
];

const inventario = readdirSync(FUNCTIONS, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== "_shared")
  .map((e) => ({
    nome: e.name,
    coberta: readdirSync(join(FUNCTIONS, e.name)).some((n) => /\.test\.tsx?$/.test(n)),
  }));

describe("inventário de Edge Functions", () => {
  it("varre um conjunto de functions não-vazio", () => {
    expect(inventario.length).toBeGreaterThan(30);
  });

  it("nenhuma function nova entra sem teste", () => {
    const novas = inventario
      .filter((f) => !f.coberta && !SEM_TESTE.includes(f.nome))
      .map((f) => f.nome);
    expect(novas).toEqual([]);
  });

  it("a allowlist não guarda function que já ganhou teste", () => {
    const cobertas = inventario.filter((f) => f.coberta && SEM_TESTE.includes(f.nome)).map((f) => f.nome);
    expect(cobertas).toEqual([]);
  });

  it("a allowlist não guarda function que deixou de existir", () => {
    const nomes = new Set(inventario.map((f) => f.nome));
    expect(SEM_TESTE.filter((n) => !nomes.has(n))).toEqual([]);
  });
});
