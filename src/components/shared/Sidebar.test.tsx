import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/**
 * A área de marketing ocupa uma linha só do menu ("Automação"), com as quatro telas dentro.
 * O que precisa ficar de pé: a gaveta abre, fecha, e nasce aberta quando a pessoa já está
 * numa das telas de dentro.
 */
describe("Sidebar: item com subitens", () => {
  it("mostra o pai e esconde os subitens quando está fora da área", async () => {
    renderWithProviders(<Sidebar variant="manager" brandTitle="Backoffice" />, {
      auth: mockAuth({}),
      route: "/manager",
    });
    expect(await screen.findByRole("button", { name: "Automação" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("link", { name: "Campanhas" })).not.toBeInTheDocument();
  });

  it("abre e fecha no clique", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Sidebar variant="manager" brandTitle="Backoffice" />, {
      auth: mockAuth({}),
      route: "/manager",
    });
    const pai = await screen.findByRole("button", { name: "Automação" });

    await user.click(pai);
    expect(await screen.findByRole("link", { name: "Campanhas" })).toBeInTheDocument();
    expect(pai).toHaveAttribute("aria-expanded", "true");

    await user.click(pai);
    expect(screen.queryByRole("link", { name: "Campanhas" })).not.toBeInTheDocument();
  });

  it("nasce aberta quando a rota atual é uma das telas de dentro", async () => {
    // Sem isso o menu esconderia justamente a tela em que a pessoa está.
    renderWithProviders(<Sidebar variant="manager" brandTitle="Backoffice" />, {
      auth: mockAuth({}),
      route: "/manager/marketing/segmentos",
    });
    expect(await screen.findByRole("button", { name: "Automação" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("link", { name: "Segmentos" })).toBeInTheDocument();
  });

  it("o subitem de índice não acende junto com os irmãos", async () => {
    // "Perfis e funil" aponta para /manager/marketing, que é prefixo de /marketing/leads.
    // Sem `end`, os dois acenderiam ao mesmo tempo.
    renderWithProviders(<Sidebar variant="manager" brandTitle="Backoffice" />, {
      auth: mockAuth({}),
      route: "/manager/marketing/leads",
    });
    const leads = await screen.findByRole("link", { name: "Leads" });
    const perfis = screen.getByRole("link", { name: "Perfis e funil" });
    expect(leads).toHaveAttribute("aria-current", "page");
    expect(perfis).not.toHaveAttribute("aria-current");
  });

  it("o pai não é link: clicar nele não tira a pessoa da página", async () => {
    renderWithProviders(<Sidebar variant="manager" brandTitle="Backoffice" />, {
      auth: mockAuth({}),
      route: "/manager",
    });
    const pai = await screen.findByRole("button", { name: "Automação" });
    expect(pai.tagName).toBe("BUTTON");
    expect(pai).not.toHaveAttribute("href");
  });
});
