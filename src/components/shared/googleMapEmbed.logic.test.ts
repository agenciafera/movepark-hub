import { describe, expect, it } from "vitest";
import {
  buildGoogleMapEmbedSrc,
  buildGoogleMapsHref,
  buildMapEmbedQuery,
} from "./googleMapEmbed.logic";

describe("buildMapEmbedQuery", () => {
  it("prefere o place_id, que é o pin exato", () => {
    expect(
      buildMapEmbedQuery({
        placeId: "ChIJ123",
        latitude: -23.5,
        longitude: -46.6,
        address: "Rua X, 100",
      }),
    ).toBe("place_id:ChIJ123");
  });

  it("cai na coordenada quando não há place_id", () => {
    expect(buildMapEmbedQuery({ latitude: -23.5, longitude: -46.6 })).toBe("-23.5,-46.6");
  });

  it("cai no endereço quando não há place_id nem coordenada", () => {
    expect(buildMapEmbedQuery({ address: "Rua X, 100" })).toBe("Rua X, 100");
  });

  it("aceita coordenada que vem como string do banco (numeric)", () => {
    expect(
      buildMapEmbedQuery({
        latitude: "-23.5" as unknown as number,
        longitude: "-46.6" as unknown as number,
      }),
    ).toBe("-23.5,-46.6");
  });

  it("ignora place_id e endereço em branco", () => {
    expect(buildMapEmbedQuery({ placeId: "   ", address: "  " })).toBeNull();
  });

  it("não plota com latitude sem longitude", () => {
    expect(buildMapEmbedQuery({ latitude: -23.5, longitude: null })).toBeNull();
  });

  it("devolve null sem nada plotável", () => {
    expect(buildMapEmbedQuery({})).toBeNull();
  });
});

describe("buildGoogleMapEmbedSrc", () => {
  it("monta a URL da Embed API com key, alvo, zoom e locale", () => {
    const src = buildGoogleMapEmbedSrc(
      { latitude: -23.5, longitude: -46.6 },
      { apiKey: "k-123", zoom: 13 },
    );
    const url = new URL(src!);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/embed/v1/place");
    expect(url.searchParams.get("key")).toBe("k-123");
    expect(url.searchParams.get("q")).toBe("-23.5,-46.6");
    expect(url.searchParams.get("zoom")).toBe("13");
    expect(url.searchParams.get("language")).toBe("pt-BR");
    expect(url.searchParams.get("region")).toBe("BR");
  });

  it("usa zoom 15 por padrão", () => {
    const src = buildGoogleMapEmbedSrc({ latitude: 1, longitude: 2 }, { apiKey: "k" });
    expect(new URL(src!).searchParams.get("zoom")).toBe("15");
  });

  it("escapa o endereço, sem quebrar a query string", () => {
    const src = buildGoogleMapEmbedSrc({ address: "Rua A & B, 10" }, { apiKey: "k" });
    expect(src).not.toContain("Rua A & B");
    expect(new URL(src!).searchParams.get("q")).toBe("Rua A & B, 10");
  });

  it("devolve null sem key, em vez de montar uma URL com key vazia", () => {
    expect(buildGoogleMapEmbedSrc({ latitude: 1, longitude: 2 }, {})).toBeNull();
    expect(buildGoogleMapEmbedSrc({ latitude: 1, longitude: 2 }, { apiKey: "  " })).toBeNull();
  });

  it("devolve null quando não há o que plotar", () => {
    expect(buildGoogleMapEmbedSrc({}, { apiKey: "k" })).toBeNull();
  });
});

describe("buildGoogleMapsHref", () => {
  it("aponta pro lugar quando há place_id", () => {
    expect(buildGoogleMapsHref({ placeId: "ChIJ123" })).toBe(
      "https://www.google.com/maps/place/?q=place_id%3AChIJ123",
    );
  });

  it("aponta pra coordenada", () => {
    expect(buildGoogleMapsHref({ latitude: -23.5, longitude: -46.6 })).toBe(
      "https://www.google.com/maps?q=-23.5,-46.6",
    );
  });

  it("aponta pro endereço escapado", () => {
    expect(buildGoogleMapsHref({ address: "Rua A & B" })).toBe(
      "https://www.google.com/maps?q=Rua%20A%20%26%20B",
    );
  });

  it("sempre devolve link válido, mesmo sem alvo", () => {
    expect(buildGoogleMapsHref({})).toBe("https://www.google.com/maps");
  });
});
