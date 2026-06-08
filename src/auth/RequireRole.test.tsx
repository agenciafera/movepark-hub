import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { RequireRole } from "./RequireRole";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import type { UserRole } from "@/types/domain";

function Harness({ roles }: { roles: UserRole[] }) {
  return (
    <Routes>
      <Route element={<RequireRole roles={roles} />}>
        <Route path="/protegido" element={<div>PROTEGIDO</div>} />
      </Route>
      <Route path="/login" element={<div>LOGIN</div>} />
      <Route path="/entrar" element={<div>ENTRAR</div>} />
      <Route path="/manager" element={<div>MANAGER</div>} />
      <Route path="/operator" element={<div>OPERATOR</div>} />
      <Route path="/" element={<div>HOME</div>} />
    </Routes>
  );
}

describe("RequireRole", () => {
  it("mostra carregando enquanto isLoading", () => {
    renderWithProviders(<Harness roles={["hub_admin"]} />, {
      auth: mockAuth({ isLoading: true }),
      route: "/protegido",
    });
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("sem sessão (rota backoffice) → redireciona para /login", () => {
    renderWithProviders(<Harness roles={["hub_admin"]} />, {
      auth: mockAuth({ session: null, effectiveRole: null }),
      route: "/protegido",
    });
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
  });

  it("sem sessão (rota customer) → redireciona para /entrar", () => {
    renderWithProviders(<Harness roles={["customer"]} />, {
      auth: mockAuth({ session: null, effectiveRole: null }),
      route: "/protegido",
    });
    expect(screen.getByText("ENTRAR")).toBeInTheDocument();
  });

  it("papel não permitido (hub_admin numa rota de operator) → fallback /manager", () => {
    renderWithProviders(<Harness roles={["company_operator"]} />, {
      auth: mockAuth({ session: mockSession("hub_admin"), effectiveRole: "hub_admin" }),
      route: "/protegido",
    });
    expect(screen.getByText("MANAGER")).toBeInTheDocument();
  });

  it("customer numa rota restrita → fallback /", () => {
    renderWithProviders(<Harness roles={["hub_admin"]} />, {
      auth: mockAuth({ session: mockSession("customer"), effectiveRole: "customer" }),
      route: "/protegido",
    });
    expect(screen.getByText("HOME")).toBeInTheDocument();
  });

  it("papel permitido → renderiza a rota protegida (Outlet)", () => {
    renderWithProviders(<Harness roles={["hub_admin"]} />, {
      auth: mockAuth({ session: mockSession("hub_admin"), effectiveRole: "hub_admin" }),
      route: "/protegido",
    });
    expect(screen.getByText("PROTEGIDO")).toBeInTheDocument();
  });

  it("impersonation: effectiveRole company_operator acessa rota de operator", () => {
    renderWithProviders(<Harness roles={["company_operator"]} />, {
      auth: mockAuth({
        session: mockSession("hub_admin"),
        effectiveRole: "company_operator",
        effectiveCompanyIds: ["company-1"],
      }),
      route: "/protegido",
    });
    expect(screen.getByText("PROTEGIDO")).toBeInTheDocument();
  });
});
