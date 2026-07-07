import * as React from "react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/test/msw/server";
import { PlateLookupField } from "./PlateLookupField";

// getSession precisa devolver um token pro useLookupPlate montar o Authorization.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
    },
  },
}));

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-vehicle-plate`;

const FOUND = {
  found: true,
  vehicle: {
    license_plate: "EQH1120",
    model: "HONDA/FIT EX FLEX",
    color: "Cinza",
    raw_color: "CINZA",
    brand: "HONDA",
    year: "2010",
    fuel: "ALCOOL / GASOLINA",
  },
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderField(props?: {
  onConfirm?: (d: unknown) => void;
  onManual?: (p: string) => void;
}) {
  const onConfirm = vi.fn(props?.onConfirm);
  const onManual = vi.fn(props?.onManual);
  render(<PlateLookupField onConfirm={onConfirm} onManual={onManual} />, { wrapper });
  return { onConfirm, onManual };
}

describe("PlateLookupField", () => {
  it("consulta ao completar a placa, mostra o card e confirma", async () => {
    server.use(http.post(URL, () => HttpResponse.json(FOUND)));
    const { onConfirm } = renderField();

    await userEvent.type(screen.getByLabelText("Placa"), "eqh1120");

    // card de confirmação aparece com os dados retornados
    await screen.findByText("É esse veículo?");
    expect(screen.getByText(/HONDA\/FIT EX FLEX/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Prosseguir/ }));
    expect(onConfirm).toHaveBeenCalledWith({
      license_plate: "EQH1120",
      model: "HONDA/FIT EX FLEX",
      color: "Cinza",
    });
  });

  it("placa não encontrada → oferece cadastro manual com a placa digitada", async () => {
    server.use(http.post(URL, () => HttpResponse.json({ found: false })));
    const { onManual } = renderField();

    await userEvent.type(screen.getByLabelText("Placa"), "abc1d23");

    await screen.findByText(/Não encontramos essa placa/);
    await userEvent.click(screen.getByRole("button", { name: /Cadastrar manualmente/ }));
    expect(onManual).toHaveBeenCalledWith("ABC-1D23");
  });

  it("erro no serviço → mostra mensagem e permite consultar de novo", async () => {
    server.use(
      http.post(URL, () => HttpResponse.json({ error: "Serviço indisponível." }, { status: 502 })),
    );
    renderField();

    await userEvent.type(screen.getByLabelText("Placa"), "eqh1120");

    expect(await screen.findByText("Serviço indisponível.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Consultar de novo/ })).toBeInTheDocument();
  });
});
