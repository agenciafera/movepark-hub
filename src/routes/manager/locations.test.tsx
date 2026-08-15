import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { rpc } from "@/test/msw/supabase";
import { renderWithProviders } from "@/test/utils";
import ManagerLocations from "./locations";

/**
 * Os dois campos de plataforma da unidade (E0.14 + Go2Park) moram no mesmo diálogo, e o valor que
 * ele mostra tem que ser o do banco depois de gravar. O diálogo já recebeu um RETRATO da linha,
 * congelado no clique: gravar desligava no banco e o interruptor continuava ligado na tela, o que
 * faz a pessoa clicar de novo achando que não pegou. Este arquivo trava o ciclo inteiro.
 */
const BASE = import.meta.env.VITE_SUPABASE_URL;
const COMPANY = "co-1";
const ROTA = `/manager/companies/${COMPANY}/locations`;
const PATH = "/manager/companies/:id/locations";

function linha(go2park: boolean) {
  return {
    id: "loc-1",
    company_id: COMPANY,
    name: "Aeroporto Afonso Pena",
    slug: "aeroporto-afonso-pena",
    address: "Av. Rocha Pombo, s/n",
    timezone: "America/Sao_Paulo",
    status: "active",
    checkout_mode: "external",
    go2park_enabled: go2park,
    destination: { id: "d-1", code: "CWB", name: "Afonso Pena", short_name: "Afonso Pena" },
  };
}

/**
 * Sobe a tela com a unidade do jeito que o banco a devolve, e deixa o PATCH mudar o que o
 * próximo GET responde. Sem isso o teste provaria só que a mutation dispara, que é justamente o
 * que já passava enquanto a tela mostrava o valor velho.
 */
function montaTela(go2parkInicial: boolean) {
  let atual = linha(go2parkInicial);
  const patches: unknown[] = [];

  server.use(
    http.get(`${BASE}/rest/v1/company`, () =>
      HttpResponse.json([{ id: COMPANY, name: "Nationpark", slug: "nationpark" }]),
    ),
    http.get(`${BASE}/rest/v1/location`, () => HttpResponse.json([atual])),
    http.patch(`${BASE}/rest/v1/location`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      patches.push(body);
      atual = { ...atual, ...body } as ReturnType<typeof linha>;
      return HttpResponse.json([atual]);
    }),
  );
  rpc("location_external_readiness", {
    json: { ready: true, missing_company: [], unmapped_count: 0, unmapped_names: [] },
  });

  renderWithProviders(<ManagerLocations />, { route: ROTA, path: PATH });
  return { patches };
}

const toggleGo2Park = () => screen.getByRole("switch", { name: /Transfer com rastreio ao vivo/ });

describe("Manager · unidades da empresa", () => {
  it("mostra o selo da Go2Park na coluna de plataforma", async () => {
    montaTela(true);
    expect(await screen.findByText("Go2Park")).toBeInTheDocument();
    expect(screen.getByText("Externo")).toBeInTheDocument();
  });

  it("sem contrato, a coluna mostra só o modo de checkout", async () => {
    montaTela(false);
    expect(await screen.findByText("Externo")).toBeInTheDocument();
    expect(screen.queryByText("Go2Park")).not.toBeInTheDocument();
  });

  it("desliga a Go2Park e a tela passa a mostrar desligado", async () => {
    const { patches } = montaTela(true);

    await userEvent.click(await screen.findByRole("button", { name: "Plataforma" }));
    await waitFor(() => expect(toggleGo2Park()).toBeChecked());

    await userEvent.click(toggleGo2Park());

    await waitFor(() => expect(patches).toEqual([{ go2park_enabled: false }]));
    // O ponto do teste: o interruptor acompanha o banco sem precisar fechar e abrir o diálogo.
    await waitFor(() => expect(toggleGo2Park()).not.toBeChecked());
    // E o selo sai da tabela junto, que é o que o cliente deixa de ver no card.
    await waitFor(() => expect(screen.queryByText("Go2Park")).not.toBeInTheDocument());
  });
});
