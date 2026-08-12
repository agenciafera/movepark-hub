import { describe, expect, it } from "vitest";
import type { ListingDetail, TerminalDistance } from "./api";
import { buildListingTldr, nearestTerminal, shuttleLabel } from "./tldr.logic";

function makeListing(o: Partial<{
  shuttle_to_terminal_minutes: number | null;
  shuttle_frequency_minutes: number | null;
  review_avg: number | null;
  review_count: number;
  base_price: number;
  checkout_mode: "hub" | "external";
}> = {}): ListingDetail {
  return {
    company: { name: "Aeropark" },
    location: {
      name: "Aeroporto Guarulhos",
      checkout_mode: o.checkout_mode ?? "hub",
      shuttle_to_terminal_minutes:
        "shuttle_to_terminal_minutes" in o ? o.shuttle_to_terminal_minutes! : null,
      shuttle_frequency_minutes:
        "shuttle_frequency_minutes" in o ? o.shuttle_frequency_minutes! : null,
      review_avg: "review_avg" in o ? o.review_avg! : null,
      review_count: o.review_count ?? 0,
    },
    parking_type: { name: "Vaga Coberta" },
    company_parking_type: { base_price: o.base_price ?? 29.9 },
  } as unknown as ListingDetail;
}

function terminal(o: Partial<TerminalDistance>): TerminalDistance {
  return {
    point_name: "Terminal 2",
    point_type: "terminal",
    distance_km: 2.3,
    is_nearest: false,
    ...o,
  };
}

describe("nearestTerminal", () => {
  it("retorna null sem terminais com distância", () => {
    expect(nearestTerminal([])).toBeNull();
    expect(nearestTerminal([terminal({ distance_km: null })])).toBeNull();
  });

  it("prioriza o marcado is_nearest", () => {
    const t = nearestTerminal([
      terminal({ point_name: "T1", distance_km: 5, is_nearest: false }),
      terminal({ point_name: "T3", distance_km: 3, is_nearest: true }),
    ]);
    expect(t?.point_name).toBe("T3");
  });

  it("cai na menor distância quando nenhum é is_nearest", () => {
    const t = nearestTerminal([
      terminal({ point_name: "T1", distance_km: 5 }),
      terminal({ point_name: "T2", distance_km: 1.2 }),
    ]);
    expect(t?.point_name).toBe("T2");
  });
});

describe("shuttleLabel", () => {
  it("null quando não há dado de traslado", () => {
    expect(shuttleLabel(makeListing())).toBeNull();
  });

  it("usa os minutos ao terminal quando presentes", () => {
    expect(shuttleLabel(makeListing({ shuttle_to_terminal_minutes: 8 }))).toBe(
      "Transfer ao terminal em 8 min",
    );
  });

  it("cai em gratuito quando só há frequência", () => {
    expect(shuttleLabel(makeListing({ shuttle_frequency_minutes: 15 }))).toBe(
      "Transfer gratuito ao terminal",
    );
  });
});

describe("buildListingTldr", () => {
  it("sempre inclui preço e cancelamento", () => {
    const { facts } = buildListingTldr(makeListing({ base_price: 25 }));
    const keys = facts.map((f) => f.key);
    expect(keys).toContain("price");
    expect(keys).toContain("cancel");
    expect(facts.find((f) => f.key === "price")?.value).toContain("R$");
    expect(facts.find((f) => f.key === "cancel")?.value).toContain("24h");
  });

  it("omite terminal, traslado e avaliação quando ausentes", () => {
    const { facts } = buildListingTldr(makeListing());
    const keys = facts.map((f) => f.key);
    expect(keys).not.toContain("terminal");
    expect(keys).not.toContain("shuttle");
    expect(keys).not.toContain("rating");
  });

  it("inclui terminal mais perto, traslado e avaliação quando disponíveis", () => {
    const { facts, summary } = buildListingTldr(
      makeListing({
        shuttle_to_terminal_minutes: 6,
        review_avg: 4.8,
        review_count: 248,
      }),
      { nearest: terminal({ point_name: "Terminal 3", distance_km: 1.5, is_nearest: true }) },
    );
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f.value]));
    expect(byKey.terminal).toBe("Terminal 3 · 1,5 km");
    expect(byKey.shuttle).toBe("Transfer ao terminal em 6 min");
    expect(byKey.rating).toBe("4,8 de 5 · 248 avaliações");
    // Summary é uma frase única e factual, extraível por IA.
    expect(summary).toContain("Vaga Coberta no Aeropark, em Aeroporto Guarulhos.");
    expect(summary).toContain("a 1,5 km de Terminal 3");
    expect(summary).toContain("Nota 4,8 de 5 em 248 avaliações");
  });

  it("singulariza uma avaliação", () => {
    const { facts } = buildListingTldr(makeListing({ review_avg: 5, review_count: 1 }));
    expect(facts.find((f) => f.key === "rating")?.value).toBe("5,0 de 5 · 1 avaliação");
  });
});

/**
 * ADR-009 na superfície que ninguém vê (regressão de 12/08/2026).
 *
 * O resumo vira meta description e `description` do JSON-LD. Prometer aqui o que o card visível
 * nega é publicar a mesma oferta indevida, só que onde o Google lê.
 */
describe("buildListingTldr · unidade externa", () => {
  const externa = (o: Parameters<typeof makeListing>[0] = {}) =>
    makeListing({ ...o, checkout_mode: "external" });

  it("não promete cancelamento, porque quem cancela é o parceiro", () => {
    const { facts, summary } = buildListingTldr(externa());
    expect(facts.map((f) => f.key)).not.toContain("cancel");
    expect(summary).not.toMatch(/cancelamento/i);
  });

  it("não publica nota, mesmo com avaliação histórica no banco", () => {
    // Caso real do Virapark: 1 avaliação de reserva feita antes da virada. A página esconde o
    // bloco (há teste de render), e o schema publicava "Nota 5,0 de 5 em 1 avaliação".
    const { facts, summary } = buildListingTldr(externa({ review_avg: 5, review_count: 1 }));
    expect(facts.map((f) => f.key)).not.toContain("rating");
    expect(summary).not.toMatch(/nota|avaliaç/i);
  });

  it("diz de quem é a reserva, que é o que sobra no lugar das promessas", () => {
    const { summary } = buildListingTldr(externa());
    expect(summary).toContain("A reserva é feita e administrada por Aeropark.");
  });

  it("mantém preço e proximidade, que descrevem a unidade e continuam verdade", () => {
    const { facts, summary } = buildListingTldr(
      externa({ base_price: 24.9, shuttle_to_terminal_minutes: 6 }),
      { nearest: terminal({ point_name: "Terminal 3", distance_km: 1.5 }) },
    );
    const keys = facts.map((f) => f.key);
    expect(keys).toContain("price");
    expect(keys).toContain("terminal");
    expect(keys).toContain("shuttle");
    // `\s` em vez de espaço literal: o formatBRL separa o "R$" com espaço não separável.
    expect(summary).toMatch(/A partir de R\$\s24,90 por diária, a 1,5 km de Terminal 3/);
  });
});

describe("buildListingTldr · preço zero", () => {
  it("omite o preço em vez de publicar R$ 0,00", () => {
    // `base_price` é 0 nas unidades espelhadas. "A partir de R$ 0,00 por diária" saía na meta
    // description de todas elas.
    const { facts, summary } = buildListingTldr(makeListing({ base_price: 0 }));
    expect(facts.map((f) => f.key)).not.toContain("price");
    expect(summary).not.toContain("R$ 0,00");
  });

  it("sem preço, a frase começa pela proximidade e não por vírgula solta", () => {
    const { summary } = buildListingTldr(makeListing({ base_price: 0 }), {
      nearest: terminal({ point_name: "Terminal 2", distance_km: 2.3 }),
    });
    expect(summary).toContain("A 2,3 km de Terminal 2.");
    expect(summary).not.toMatch(/\.\s*,/);
  });

  it("sem preço e sem proximidade, a frase inteira desaparece", () => {
    const { summary } = buildListingTldr(makeListing({ base_price: 0 }));
    expect(summary).toBe(
      "Vaga Coberta no Aeropark, em Aeroporto Guarulhos. Cancelamento grátis até 24h antes do check-in.",
    );
  });
});
