import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { Topbar } from "./Topbar";

const SUPABASE_URL = "http://localhost:54321";

/**
 * No tablet e no celular a sidebar some ou vira só ícone, então a troca de empresa do parceiro
 * com mais de uma mora no menu do avatar (13/10/2026).
 */
describe("Topbar: troca de empresa no menu do avatar", () => {
  function mockCompanies() {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/company`, () =>
        HttpResponse.json([
          { id: "c1", name: "Abbapark" },
          { id: "c2", name: "Nationpark" },
        ]),
      ),
    );
  }

  const abreMenu = async () => {
    // O avatar é o botão com as iniciais ("Teste" vira "T").
    await userEvent.click(screen.getByRole("button", { name: "T" }));
  };

  it("com mais de uma empresa, lista as empresas e troca para a escolhida", async () => {
    mockCompanies();
    const switchCompany = vi.fn();
    renderWithProviders(<Topbar onOpenSearch={() => {}} />, {
      auth: mockAuth({
        session: mockSession("company_operator", {
          companyIds: ["c1", "c2"],
          companyRoles: { c1: "owner", c2: "finance" },
        }),
        effectiveCompanyIds: ["c1"],
        switchCompany,
      }),
      route: "/operator",
    });

    await abreMenu();
    expect(await screen.findByText("Empresa")).toBeInTheDocument();
    const nation = await screen.findByRole("menuitem", { name: /Nationpark/ });
    expect(nation).toHaveTextContent("Financeiro");

    await userEvent.click(nation);
    expect(switchCompany).toHaveBeenCalledWith("c2");
  });

  it("com uma empresa só, o menu não fala de empresa", async () => {
    mockCompanies();
    renderWithProviders(<Topbar onOpenSearch={() => {}} />, {
      auth: mockAuth({
        session: mockSession("company_operator"),
        effectiveCompanyIds: ["company-1"],
      }),
      route: "/operator",
    });

    await abreMenu();
    expect(await screen.findByRole("menuitem", { name: /Sair/ })).toBeInTheDocument();
    expect(screen.queryByText("Empresa")).not.toBeInTheDocument();
  });
});
