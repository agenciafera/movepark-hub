import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { ReferralSidebarBanner } from "./ReferralSidebarBanner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SUPABASE_URL = "http://localhost:54321";

function render(referrals: object | null) {
  server.use(
    http.post(`${SUPABASE_URL}/rest/v1/rpc/get_my_referrals`, () =>
      HttpResponse.json(referrals),
    ),
  );
  return renderWithProviders(<ReferralSidebarBanner />, {
    auth: mockAuth({ session: mockSession("customer") }),
    route: "/account/profile",
  });
}

const INFO = {
  code: "501D3D81",
  link: "https://hub.movepark.co/r/501D3D81",
  reward_amount: 25,
  counts: { pending: 0, qualified: 0, rewarded: 0 },
  referrals: [],
};

describe("ReferralSidebarBanner", () => {
  it("mostra o valor do programa dos dois lados e o código do cliente", async () => {
    render(INFO);
    // "Dê R$ 25, ganhe R$ 25": o mesmo valor nas duas pontas.
    expect(await screen.findByText(/Dê R\$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /501D3D81/ })).toBeInTheDocument();
  });

  /** O valor é config do programa: mudar no banco tem que mudar na tela. */
  it("o valor vem da API, não do código", async () => {
    render({ ...INFO, reward_amount: 40 });
    const titulo = await screen.findByText(/Dê R\$/);
    expect(titulo.textContent).toContain("40");
    expect(titulo.textContent).not.toContain("25");
  });

  it("valor redondo não mostra os centavos", async () => {
    render(INFO);
    const titulo = await screen.findByText(/Dê R\$/);
    expect(titulo.textContent).not.toContain(",00");
  });

  /** Sem código não há o que compartilhar: prometer crédito sem caminho é pior que nada. */
  it("sem código de indicação, o banner não aparece", async () => {
    render({ ...INFO, code: "" });
    await waitFor(() => expect(screen.queryByText(/Dê R\$/)).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Compartilhar" })).not.toBeInTheDocument();
  });

  it("copia o link de indicação, não só o código", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    // Depois do `setup()`, que instala o clipboard stub do próprio userEvent por
    // cima. E com `defineProperty` porque `navigator.clipboard` só tem getter.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(INFO);

    await user.click(await screen.findByRole("button", { name: /501D3D81/ }));
    expect(writeText).toHaveBeenCalledWith(INFO.link);
    // O rótulo confirma a ação sem depender do toast.
    expect(await screen.findByRole("button", { name: /copiado/ })).toBeInTheDocument();
  });

  it("compartilhar abre o WhatsApp com o link do cliente", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const user = userEvent.setup();
    render(INFO);

    await user.click(await screen.findByRole("button", { name: "Compartilhar" }));
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent(INFO.link)),
      "_blank",
      "noopener",
    );
    vi.unstubAllGlobals();
  });
});
