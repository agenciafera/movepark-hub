import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoogleMapEmbed } from "./GoogleMapEmbed";

// O happy-dom lança ao conectar um iframe de verdade (mesmo motivo pelo qual `MapEmbed` existe
// como componente próprio), então trocamos por um stub que só expõe o `src` para asserção.
vi.mock("./MapEmbed", () => ({
  MapEmbed: ({ src, title }: { src: string; title: string }) => (
    <div data-testid="map-embed" data-src={src} aria-label={title} />
  ),
}));

const SP = { latitude: -23.55, longitude: -46.63 };

describe("GoogleMapEmbed", () => {
  it("sem key, mostra o bloco de fallback em vez de um iframe quebrado", () => {
    // `src/test/setup.ts` já stuba a key como "" (é o cenário do CI e da suíte E2E).
    render(<GoogleMapEmbed target={SP} title="Mapa de Guarulhos" className="h-80" />);

    expect(screen.queryByTestId("map-embed")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mapa de Guarulhos" })).toBeInTheDocument();
  });

  it("com key, embeda a Maps Embed API do Google apontando pro alvo", () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");

    render(<GoogleMapEmbed target={SP} title="Mapa de Guarulhos" zoom={13} />);

    const src = screen.getByTestId("map-embed").getAttribute("data-src") ?? "";
    const url = new URL(src);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/embed/v1/place");
    expect(url.searchParams.get("q")).toBe("-23.55,-46.63");
    expect(url.searchParams.get("zoom")).toBe("13");

    vi.unstubAllEnvs();
  });

  it("sem coordenada nem endereço, não tenta embedar", () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");

    render(<GoogleMapEmbed target={{ latitude: null, longitude: null }} title="Mapa" />);

    expect(screen.queryByTestId("map-embed")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mapa" })).toBeInTheDocument();

    vi.unstubAllEnvs();
  });
});
