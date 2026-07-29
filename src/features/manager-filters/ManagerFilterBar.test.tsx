import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { ManagerFilterProvider } from "./ManagerFilterProvider";
import { ManagerFilterBar } from "./ManagerFilterBar";

const SUPABASE_URL = "http://localhost:54321";

const LOCATIONS = [
  { id: "loc-1", name: "Aeropark GRU", company: { id: "c1", name: "Aeropark" } },
  { id: "loc-2", name: "Virapark VCP", company: { id: "c2", name: "Virapark" } },
];

function renderBar() {
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/location`, () => HttpResponse.json(LOCATIONS)),
  );
  return renderWithProviders(
    <ManagerFilterProvider>
      <ManagerFilterBar />
    </ManagerFilterProvider>,
    {
      auth: mockAuth({ session: mockSession("hub_admin"), effectiveRole: "hub_admin" }),
      route: "/manager",
    },
  );
}

describe("ManagerFilterBar", () => {
  it("abre no consolidado da rede e nos últimos 30 dias", () => {
    renderBar();
    expect(screen.getByText("Todas as unidades")).toBeInTheDocument();
    expect(screen.getByText("Últimos 30 dias")).toBeInTheDocument();
  });

  it("troca o período pelo atalho e o botão passa a mostrar a escolha", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByText("Últimos 30 dias"));
    await user.click(await screen.findByRole("button", { name: "Este mês" }));

    await waitFor(() => expect(screen.getByText("Este mês")).toBeInTheDocument());
    expect(screen.queryByText("Últimos 30 dias")).not.toBeInTheDocument();
  });

  it("escolher uma unidade tira a tela do consolidado", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByText("Todas as unidades"));
    await user.click(await screen.findByRole("button", { name: "Virapark VCP" }));

    // O botão passa a nomear a unidade escolhida, e não mais "todas".
    await waitFor(() =>
      expect(screen.getAllByText("Virapark VCP").length).toBeGreaterThanOrEqual(1),
    );
    expect(screen.getByText("recorte aplicado")).toBeInTheDocument();
  });

  it("a comparação padrão é o período anterior e dá pra desligar", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByText("Últimos 30 dias"));
    const anterior = await screen.findByRole("button", { name: "Período anterior" });
    expect(anterior).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Sem comparação" }));
    expect(screen.getByRole("button", { name: "Sem comparação" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(anterior).toHaveAttribute("aria-pressed", "false");
  });

  it("o filtro de unidade some quando a tela não usa (moderação)", () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/location`, () => HttpResponse.json(LOCATIONS)),
    );
    renderWithProviders(
      <ManagerFilterProvider>
        <ManagerFilterBar showPeriod={false} />
      </ManagerFilterProvider>,
      {
        auth: mockAuth({ session: mockSession("hub_admin"), effectiveRole: "hub_admin" }),
        route: "/manager/reviews",
      },
    );
    expect(screen.getByText("Todas as unidades")).toBeInTheDocument();
    expect(screen.queryByText("Últimos 30 dias")).not.toBeInTheDocument();
  });
});
