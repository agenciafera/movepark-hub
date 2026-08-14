import { describe, expect, it } from "vitest";
import { isSnapshotFresh, pickCardBadge } from "./google.logic";

const NOW = new Date("2026-08-14T12:00:00Z");

describe("isSnapshotFresh", () => {
  it("aceita snapshot de 3 dias", () => {
    expect(isSnapshotFresh("2026-08-11T12:00:00Z", NOW)).toBe(true);
  });

  it("recusa snapshot de 31 dias, porque o limite de cache do Google e 30", () => {
    expect(isSnapshotFresh("2026-07-14T11:00:00Z", NOW)).toBe(false);
  });
});

describe("pickCardBadge", () => {
  it("prioriza a nota Movepark quando ela existe", () => {
    const out = pickCardBadge({ avg: 4.9, count: 12 }, { rating: 4.6, count: 312 });
    expect(out).toEqual({ source: "movepark", avg: 4.9, count: 12 });
  });

  it("usa a do Google quando nao ha avaliacao Movepark", () => {
    const out = pickCardBadge({ avg: null, count: 0 }, { rating: 4.6, count: 312 });
    expect(out).toEqual({ source: "google", avg: 4.6, count: 312 });
  });

  it("usa a do Google quando a Movepark tem media mas contagem zero", () => {
    const out = pickCardBadge({ avg: 5, count: 0 }, { rating: 4.6, count: 312 });
    expect(out).toEqual({ source: "google", avg: 4.6, count: 312 });
  });

  it("devolve null quando nenhuma das duas existe", () => {
    expect(pickCardBadge({ avg: null, count: 0 }, null)).toBeNull();
  });

  it("devolve null quando o Google tem place mas nenhuma avaliacao", () => {
    expect(pickCardBadge({ avg: null, count: 0 }, { rating: null, count: 0 })).toBeNull();
  });
});
