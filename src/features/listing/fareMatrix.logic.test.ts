import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG, basicCancelLabel, buildFareMatrix, farePresentation } from "./fareMatrix.logic";
import type { FareOption } from "@/lib/fares";

describe("buildFareMatrix", () => {
  it("com o catálogo padrão reproduz a matriz de sempre, sem vaga garantida no grid", () => {
    const { tiers, rows } = buildFareMatrix(DEFAULT_CATALOG);
    expect(tiers.map((t) => t.id)).toEqual(["basic", "flex", "superflex"]);
    expect(rows.map((r) => r.label)).toEqual([
      "Cancelamento grátis até 24h antes",
      "Cancelamento grátis até 1 min antes",
      "Confirmação por e-mail",
      "Troca de placa/veículo",
      "Alteração de data/horário",
      "Avisos por WhatsApp",
      "Proteção contra atraso de voo",
    ]);
    expect(rows[0].included).toEqual([true, true, true]);
    expect(rows[1].included).toEqual([false, false, true]);
    expect(rows.find((r) => r.label === "Troca de placa/veículo")?.included).toEqual([false, true, true]);
    // Suporte prioritário saiu do catálogo em 25/09/2026: linha que ninguém tem não aparece.
    expect(rows.find((r) => r.label === "Suporte prioritário")).toBeUndefined();
  });

  it("segue o catálogo: janela da Flex vira 48h e o suporte prioritário volta se alguma tarifa tiver", () => {
    const cat: FareOption[] = DEFAULT_CATALOG.map((f) =>
      f.tier === "flex" ? { ...f, cancel_window_minutes: 2880 }
      : f.tier === "superflex" ? { ...f, benefits: { ...f.benefits, priority_support: true } }
      : f,
    );
    const { rows } = buildFareMatrix(cat);
    expect(rows.map((r) => r.label).slice(0, 3)).toEqual([
      "Cancelamento grátis até 2 dias antes",
      "Cancelamento grátis até 24h antes",
      "Cancelamento grátis até 1 min antes",
    ]);
    // janela maior é pior para o cliente: quem cancela até 24h também cumpre "até 2 dias"
    expect(rows[0].included).toEqual([true, true, true]);
    expect(rows[1].included).toEqual([true, false, true]);
    expect(rows.find((r) => r.label === "Suporte prioritário")?.included).toEqual([false, false, true]);
  });

  it("tarifa desligada no catálogo some da matriz; sem catálogo, cai no padrão", () => {
    expect(buildFareMatrix(DEFAULT_CATALOG.filter((f) => f.tier !== "superflex")).tiers.map((t) => t.id)).toEqual(["basic", "flex"]);
    expect(buildFareMatrix([]).tiers).toHaveLength(3);
  });

  it("tarifa sem cancelamento grátis não marca nenhuma linha de cancelamento", () => {
    const cat = DEFAULT_CATALOG.map((f) => (f.tier === "basica" ? { ...f, cancel_window_minutes: null } : f));
    const { rows } = buildFareMatrix(cat);
    expect(rows[0].included[0]).toBe(false);
  });
});

describe("farePresentation", () => {
  const [basica, flex, superflex] = DEFAULT_CATALOG;
  it("Básica lista o que tem; Flex e Superflex dizem o que acrescentam", () => {
    expect(farePresentation(basica, null)).toEqual({
      tooltip: ["Cancele grátis até 24h antes", "Confirmação por e-mail", "Vaga garantida"],
      badgeText: "Cancelamento grátis até 24h antes",
      cancellationLine: "Cancelamento grátis até 24h antes",
    });
    expect(farePresentation(flex, basica)).toEqual({
      tooltip: ["Tudo da Básica", "Troca de placa/veículo", "Alteração de data/horário", "Avisos por WhatsApp"],
      badgeText: "Cancelamento grátis até 24h antes",
      cancellationLine: "Cancelamento grátis até 24h antes · troca de placa liberada",
    });
    expect(farePresentation(superflex, flex)).toEqual({
      tooltip: ["Tudo da Flex", "Cancele grátis até 1 min antes", "Proteção contra atraso de voo"],
      badgeText: "Cancelamento grátis até 1 min antes",
      cancellationLine: "Cancelamento grátis até 1 min antes · troca de placa liberada",
    });
  });
  it("sem janela, o card diz que não tem cancelamento grátis", () => {
    expect(farePresentation({ ...basica, cancel_window_minutes: null }, null).badgeText).toBe("Sem cancelamento grátis");
  });
});

describe("basicCancelLabel", () => {
  it("lê a janela da Básica do catálogo, com o padrão de 24h sem catálogo", () => {
    expect(basicCancelLabel(null)).toBe("até 24h antes");
    expect(basicCancelLabel(DEFAULT_CATALOG.map((f) => (f.tier === "basica" ? { ...f, cancel_window_minutes: 720 } : f)))).toBe("até 12h antes");
  });
});
