import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { CompanySwitcher } from "./CompanySwitcher";

const SUPABASE_URL = "http://localhost:54321";

const COMPANIES = [
  { id: "c1", name: "Virapark", slug: "virapark" },
  { id: "c2", name: "Motion Park", slug: "motion-park" },
];

function render(over: Parameters<typeof mockAuth>[0] = {}) {
  server.use(http.get(`${SUPABASE_URL}/rest/v1/company`, () => HttpResponse.json(COMPANIES)));
  return renderWithProviders(<CompanySwitcher name="Rede completa" detail="30 unidades" />, {
    auth: mockAuth({ session: mockSession("hub_admin"), impersonatedCompanyId: null, ...over }),
    route: "/manager",
  });
}

describe("CompanySwitcher", () => {
  it("mostra a conta em escopo no gatilho", () => {
    render();
    expect(screen.getByRole("button", { name: "Trocar de conta" })).toBeInTheDocument();
    expect(screen.getByText("Rede completa")).toBeInTheDocument();
    expect(screen.getByText("30 unidades")).toBeInTheDocument();
  });

  it("abre a lista de empresas e entra como operador da escolhida", async () => {
    const startImpersonation = vi.fn();
    const user = userEvent.setup();
    render({ startImpersonation });

    await user.click(screen.getByRole("button", { name: "Trocar de conta" }));
    await user.click(await screen.findByRole("button", { name: /Motion Park/ }));

    expect(startImpersonation).toHaveBeenCalledWith("c2");
  });

  /** Sair da impersonation é o caminho de volta, e some se não estiver na lista. */
  it("oferece voltar pra rede completa e marca onde o admin está", async () => {
    const stopImpersonation = vi.fn();
    const user = userEvent.setup();
    render({ impersonatedCompanyId: "c1", stopImpersonation });

    await user.click(screen.getByRole("button", { name: "Trocar de conta" }));
    const rede = await screen.findByRole("button", { name: /Rede completa/ });
    // Impersonando, "Rede completa" é caminho de volta, não o estado atual.
    expect(rede).toHaveAttribute("aria-pressed", "false");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Virapark/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );

    await user.click(rede);
    expect(stopImpersonation).toHaveBeenCalled();
  });

  it("filtra a lista pela busca", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Trocar de conta" }));
    await user.type(await screen.findByLabelText("Buscar empresa"), "motion");

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Virapark/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Motion Park/ })).toBeInTheDocument();
  });
});
