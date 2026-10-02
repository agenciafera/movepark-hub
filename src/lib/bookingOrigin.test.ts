import { describe, expect, it } from "vitest";
import { BOOKING_ORIGIN, isHubOrigin, originFromSrc } from "./bookingOrigin";

describe("originFromSrc", () => {
  it("mapeia a fonte de entrada", () => {
    expect(originFromSrc("search")).toBe(BOOKING_ORIGIN.HUB_SEARCH);
    expect(originFromSrc("destino")).toBe(BOOKING_ORIGIN.HUB_DESTINO);
  });
  it("ausente/desconhecido → entrada direta", () => {
    expect(originFromSrc(null)).toBe(BOOKING_ORIGIN.HUB_DIRECT);
    expect(originFromSrc(undefined)).toBe(BOOKING_ORIGIN.HUB_DIRECT);
    expect(originFromSrc("qualquer")).toBe(BOOKING_ORIGIN.HUB_DIRECT);
  });
});

describe("isHubOrigin", () => {
  it("hub_* é do hub; resto não", () => {
    expect(isHubOrigin(BOOKING_ORIGIN.HUB_SEARCH)).toBe(true);
    expect(isHubOrigin(BOOKING_ORIGIN.HUB_DIRECT)).toBe(true);
    expect(isHubOrigin(BOOKING_ORIGIN.WHITE_LABEL)).toBe(false);
    expect(isHubOrigin(BOOKING_ORIGIN.API)).toBe(false);
    expect(isHubOrigin(null)).toBe(false);
    expect(isHubOrigin("listing")).toBe(false);
  });
});

import { attributionChips, attributionEntries, bookingOriginLabel } from "./bookingOrigin";

describe("bookingOriginLabel", () => {
  it("traduz cada origem e mantém a desconhecida como veio", () => {
    expect(bookingOriginLabel("hub_search")).toBe("Site Movepark, pela busca");
    expect(bookingOriginLabel("whatsapp-bot")).toBe("Mia no WhatsApp");
    expect(bookingOriginLabel("mcp")).toBe("Mia (agente) pelo MCP");
    expect(bookingOriginLabel(null)).toBe("Origem não registrada");
    expect(bookingOriginLabel("algo-novo")).toBe("algo-novo");
  });
});

describe("attributionEntries e attributionChips", () => {
  const b = {
    utm_source: "agenciafera", utm_medium: "parceiro", utm_campaign: null,
    attribution: { origin: "hub_direct", utm_source: "agenciafera", utm_medium: "parceiro", clicked_at: "2026-09-22T12:00:00Z", landing_url: "/p/x?utm_source=agenciafera", referrer: "https://google.com", extra_flag: "sim" },
    created_via_api_key_id: null,
  };
  it("lista tudo uma vez só, com rótulo humano e data formatada", () => {
    const e = attributionEntries(b, (iso) => `D(${iso})`);
    expect(e.map((x) => x.label)).toEqual(["utm_source", "utm_medium", "Chegou pelo link em", "Página de entrada", "Veio de", "Origem registrada no clique", "extra_flag"]);
    expect(e.find((x) => x.label === "Chegou pelo link em")?.value).toBe("D(2026-09-22T12:00:00Z)");
  });
  it("chips só com source, medium e campaign", () => {
    expect(attributionChips(b)).toEqual(["source: agenciafera", "medium: parceiro"]);
    expect(attributionChips({ attribution: null })).toEqual([]);
  });
});
