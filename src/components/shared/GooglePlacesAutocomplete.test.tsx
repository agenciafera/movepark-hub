import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  GooglePlacesAutocomplete,
  isGooglePlacesEnabled,
} from "./GooglePlacesAutocomplete";

/**
 * No ambiente de teste `VITE_GOOGLE_MAPS_API_KEY` não está definido (import.meta.env stubado em
 * src/test/setup.ts), então o componente deve degradar para um input comum e NÃO carregar script —
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
