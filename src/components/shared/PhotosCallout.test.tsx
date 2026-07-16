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
    expect(screen.getByText(/obrigatório para vender/i)).toBeInTheDocument();
    expect(screen.getByText(/pelo menos 1 foto/i)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /adicionar fotos/i });
    expect(cta).toHaveAttribute("href", "/operator/locations");
  });

  it("quando já tem foto, estimula subir mais em vez de cobrar o mínimo", () => {
    render(
      <MemoryRouter>
        <PhotosCallout hasPhotos />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/obrigatório para vender/i)).toBeNull();
    expect(screen.queryByText(/precisa de pelo menos 1 foto/i)).toBeNull();
    expect(screen.getByText(/mais fotos, mais reservas/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /adicionar mais fotos/i })).toBeInTheDocument();
  });
});
