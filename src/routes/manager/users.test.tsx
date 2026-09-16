import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { rpc } from "@/test/msw/supabase";
import { renderWithProviders } from "@/test/utils";
import ManagerUsers from "./users";

/**
 * Manager › Usuários é paginado no servidor e identifica a pessoa por e-mail, telefone e último
 * canal de login (16/09/2026). Este arquivo trava o contrato com a RPC `admin_list_users`: o que
 * a tela pede (busca, limite, offset) e o que ela mostra do que recebe.
 */
const BASE = import.meta.env.VITE_SUPABASE_URL;

function linha(n: number, extra: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
    full_name: `Pessoa ${n}`,
    role: "customer",
    created_at: "2026-09-01T12:00:00Z",
    email: `pessoa${n}@ex.com`,
    phone: "5511999990001",
    last_login_at: "2026-09-15T10:30:00Z",
    last_login_channel: "whatsapp",
    is_tester: false,
    companies: [],
    ...extra,
  };
}

function montaTela(total: number, rows: ReturnType<typeof linha>[]) {
  server.use(http.get(`${BASE}/rest/v1/company`, () => HttpResponse.json([])));
  const chamada = rpc("admin_list_users", { json: { total, rows } });
  renderWithProviders(<ManagerUsers />);
  return chamada;
}

describe("Manager · Usuários", () => {
  it("pede a primeira página ao servidor e mostra e-mail, telefone e canal do último login", async () => {
    const chamada = montaTela(1, [linha(1)]);
    expect(await screen.findByText("Pessoa 1")).toBeInTheDocument();
    expect(chamada.ultimoBody).toEqual({ p_search: null, p_limit: 25, p_offset: 0 });
    expect(screen.getByText("pessoa1@ex.com")).toBeInTheDocument();
    expect(screen.getByText("(11) 99999-0001")).toBeInTheDocument();
    expect(screen.getByTestId(`login-channel-${linha(1).id}`)).toHaveTextContent("WhatsApp");
    expect(screen.getByText("1 a 1 de 1")).toBeInTheDocument();
  });

  it("sem canal registrado, diz isso em vez de inventar; quem nunca entrou também", async () => {
    montaTela(2, [
      linha(1, { last_login_channel: null }),
      linha(2, { last_login_at: null, last_login_channel: null }),
    ]);
    expect(await screen.findByText("canal não registrado")).toBeInTheDocument();
    expect(screen.getByText("nunca entrou")).toBeInTheDocument();
  });

  it("Próxima pede o offset seguinte; a busca vai ao servidor e volta à primeira página", async () => {
    const chamada = montaTela(60, Array.from({ length: 25 }, (_, i) => linha(i + 1)));
    expect(await screen.findByText("Pessoa 1")).toBeInTheDocument();
    expect(screen.getByText("1 a 25 de 60")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() =>
      expect(chamada.ultimoBody).toEqual({ p_search: null, p_limit: 25, p_offset: 25 }),
    );

    await userEvent.type(screen.getByRole("textbox", { name: "Buscar usuário" }), "maria");
    await waitFor(() =>
      expect(chamada.ultimoBody).toEqual({ p_search: "maria", p_limit: 25, p_offset: 0 }),
    );
  });
});
