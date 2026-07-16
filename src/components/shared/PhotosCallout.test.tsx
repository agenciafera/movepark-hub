import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PhotosCallout } from "./PhotosCallout";

describe("PhotosCallout", () => {
  it("destaca as fotos e leva pro destino informado", () => {
    render(
      <MemoryRouter>
        <PhotosCallout to="/operator/locations" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/atrai cliente/i)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /adicionar fotos/i });
    expect(cta).toHaveAttribute("href", "/operator/locations");
  });
});
