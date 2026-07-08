import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { RootErrorBoundary } from "./RootErrorBoundary";

function renderWithLoaderError(error: unknown) {
  const router = createMemoryRouter([
    {
      path: "/",
      loader: () => {
        throw error;
      },
      element: <div>página</div>,
      errorElement: <RootErrorBoundary />,
    },
  ]);
  return render(<RouterProvider router={router} />);
}

describe("RootErrorBoundary", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("erro de build velho → mostra 'Atualizando…' e recarrega uma vez", async () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      reload,
    } as unknown as Location);

    renderWithLoaderError(
      new SyntaxError(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`),
    );

    expect(await screen.findByText(/Atualizando/i)).toBeInTheDocument();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("erro genuíno → mostra tela amigável, sem recarregar", async () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      reload,
    } as unknown as Location);

    renderWithLoaderError(new Error("Falha de verdade"));

    expect(await screen.findByText(/Algo deu errado/i)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it("build velho de novo dentro do cooldown → não fica em loop, mostra tela amigável", async () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      reload,
    } as unknown as Location);
    // Simula que já recarregamos agora há pouco.
    sessionStorage.setItem("mp:stale-build-reloaded-at", String(Date.now()));

    renderWithLoaderError(new SyntaxError("Unexpected end of JSON input"));

    expect(await screen.findByText(/Algo deu errado/i)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
