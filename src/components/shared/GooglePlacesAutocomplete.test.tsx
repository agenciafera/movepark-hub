import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  GooglePlacesAutocomplete,
  isGooglePlacesEnabled,
} from "./GooglePlacesAutocomplete";

/**
 * No ambiente de teste `VITE_GOOGLE_MAPS_API_KEY` não está definido (import.meta.env stubado em
 * src/test/setup.ts), então o componente deve degradar para um input comum e NÃO carregar script,
 * a "key plugável depois" não pode quebrar o wizard.
 */
describe("GooglePlacesAutocomplete (sem key)", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("degrada: Google Places desabilitado sem key", () => {
    expect(isGooglePlacesEnabled).toBe(false);
  });

  it("renderiza um input controlado e propaga onChange", () => {
    const onChange = vi.fn();
    render(
      <GooglePlacesAutocomplete value="" onChange={onChange} onSelect={vi.fn()} id="addr" />,
    );
    const input = screen.getByPlaceholderText(/endereço/i);
    fireEvent.change(input, { target: { value: "Rua das Vagas, 10" } });
    expect(onChange).toHaveBeenCalledWith("Rua das Vagas, 10");
  });

  it("não injeta o script do Google Maps quando não há key", () => {
    render(<GooglePlacesAutocomplete value="" onChange={vi.fn()} onSelect={vi.fn()} />);
    const scripts = document.head.querySelectorAll('script[src*="maps.googleapis.com"]');
    expect(scripts.length).toBe(0);
  });
});

/**
 * Com key, o componente liga o caminho do web component da Places API (New): não renderiza o input
 * de fallback e injeta o script do Maps (o `PlaceAutocompleteElement` monta client-side depois).
 * `isGooglePlacesEnabled` é const de módulo, então re-importamos o módulo com a env stubada.
 */
describe("GooglePlacesAutocomplete (com key)", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    vi.resetModules();
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
  });

  it("liga o Places e injeta o script, sem input de fallback", async () => {
    const mod = await import("./GooglePlacesAutocomplete");
    expect(mod.isGooglePlacesEnabled).toBe(true);
    render(<mod.GooglePlacesAutocomplete value="" onChange={vi.fn()} onSelect={vi.fn()} id="addr" />);
    expect(screen.queryByPlaceholderText(/endereço/i)).toBeNull();
    const scripts = document.head.querySelectorAll('script[src*="maps.googleapis.com"]');
    expect(scripts.length).toBe(1);
    expect(scripts[0].getAttribute("src")).toContain("maps/api/js");
  });
});
