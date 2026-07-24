import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { mockAuth, renderWithProviders } from "@/test/utils";
import { Sidebar } from "./Sidebar";

const SUPABASE_URL = "http://localhost:54321";

function mockCompanyName(name: string) {
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/company`, () => HttpResponse.json([{ id: "c1", name }])),
  );
}

describe("Sidebar: subtítulo sob a marca", () => {
  // Regressão: o hub_admin "vê" todas as empresas, então effectiveCompanyIds[0] é só a
  // primeira da lista. A sidebar do manager mostrava esse nome (ex.: "Virapark") como se o
  // admin fosse dela. Sem impersonar, tem que ficar o brandTitle.
  it("manager sem impersonar mostra o brandTitle, não a primeira empresa da lista", async () => {
    mockCompanyName("Virapark");
    renderWithProviders(<Sidebar variant="manager" brandTitle="Backoffice" />, {
      auth: mockAuth({ effectiveCompanyIds: ["c1"], impersonatedCompanyId: null }),
      route: "/manager",
    });
    expect(await screen.findByText("Backoffice")).toBeInTheDocument();
    expect(screen.queryByText("Virapark")).not.toBeInTheDocument();
  });

  it("manager impersonando mostra o nome da empresa", async () => {
    mockCompanyName("Virapark");
    renderWithProviders(<Sidebar variant="manager" brandTitle="Backoffice" />, {
      auth: mockAuth({ effectiveCompanyIds: ["c1"], impersonatedCompanyId: "c1" }),
      route: "/manager",
    });
    expect(await screen.findByText("Virapark")).toBeInTheDocument();
  });

  it("operator mostra a empresa em escopo", async () => {
    mockCompanyName("Abbapark");
    renderWithProviders(<Sidebar variant="operator" brandTitle="Operação" />, {
      auth: mockAuth({ effectiveCompanyIds: ["c1"], impersonatedCompanyId: null }),
      route: "/operator",
    });
    expect(await screen.findByText("Abbapark")).toBeInTheDocument();
  });
});
