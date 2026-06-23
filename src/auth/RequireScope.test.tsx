import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { RequireScope } from "./RequireScope";
import { mockAuth, renderWithProviders } from "@/test/utils";

function tree() {
  return (
    <Routes>
      <Route element={<RequireScope scope="finance:read" />}>
        <Route path="/operator/finance" element={<div>Conteúdo financeiro</div>} />
      </Route>
      <Route path="/operator" element={<div>Dashboard do operador</div>} />
    </Routes>
  );
}

describe("RequireScope", () => {
  it("com o escopo, renderiza o conteúdo", () => {
    renderWithProviders(tree(), {
      auth: mockAuth({ hasScope: (s) => s === "finance:read" }),
      route: "/operator/finance",
    });
    expect(screen.getByText("Conteúdo financeiro")).toBeInTheDocument();
  });

  it("sem o escopo, redireciona pro dashboard do operador", () => {
    renderWithProviders(tree(), {
      auth: mockAuth({ hasScope: () => false }),
      route: "/operator/finance",
    });
    expect(screen.queryByText("Conteúdo financeiro")).not.toBeInTheDocument();
    expect(screen.getByText("Dashboard do operador")).toBeInTheDocument();
  });

  it("enquanto carrega, mostra estado de carregamento", () => {
    renderWithProviders(tree(), {
      auth: mockAuth({ isLoading: true, hasScope: () => false }),
      route: "/operator/finance",
    });
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });
});
