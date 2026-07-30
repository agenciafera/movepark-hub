import * as React from "react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { server } from "@/test/msw/server";
import { useCompanyRevenueGoal, useSetRevenueGoal } from "./api";

const RPC = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/operator_set_revenue_goal`;
const COMPANY = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/company`;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useSetRevenueGoal", () => {
  it("manda a empresa e a meta em centavos para a RPC", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(RPC, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(null);
      }),
    );
    const { result } = renderHook(() => useSetRevenueGoal("c1"), { wrapper });
    await result.current.mutateAsync(40000);
    expect(body).toEqual({ p_company_id: "c1", p_goal_cents: 40000 });
  });

  /**
   * Limpar a meta é zero na RPC, e é ela que transforma zero em nulo. Mandar
   * `null` daqui deixaria o parâmetro de fora do corpo e a RPC cairia no default.
   */
  it("limpar a meta vira zero, não um campo ausente", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(RPC, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(null);
      }),
    );
    const { result } = renderHook(() => useSetRevenueGoal("c1"), { wrapper });
    await result.current.mutateAsync(null);
    expect(body).toEqual({ p_company_id: "c1", p_goal_cents: 0 });
  });

  it("sem empresa no escopo, falha antes de chamar o servidor", async () => {
    let chamou = false;
    server.use(
      http.post(RPC, () => {
        chamou = true;
        return HttpResponse.json(null);
      }),
    );
    const { result } = renderHook(() => useSetRevenueGoal(undefined), { wrapper });
    await expect(result.current.mutateAsync(1000)).rejects.toThrow(/Empresa não identificada/);
    expect(chamou).toBe(false);
  });

  it("propaga o 42501 do gate de escopo", async () => {
    server.use(
      http.post(RPC, () =>
        HttpResponse.json(
          { message: "Sem permissão para definir a meta de receita." },
          { status: 403 },
        ),
      ),
    );
    const { result } = renderHook(() => useSetRevenueGoal("c1"), { wrapper });
    await expect(result.current.mutateAsync(1000)).rejects.toThrow(/Sem permissão/);
  });
});

describe("useCompanyRevenueGoal", () => {
  it("empresa sem meta devolve null em vez de zero", async () => {
    server.use(http.get(COMPANY, () => HttpResponse.json({ monthly_revenue_goal_cents: null })));
    const { result } = renderHook(() => useCompanyRevenueGoal("c1"), { wrapper });
    await expect(
      new Promise((resolve) => {
        const timer = setInterval(() => {
          if (!result.current.isLoading) {
            clearInterval(timer);
            resolve(result.current.data);
          }
        }, 10);
      }),
    ).resolves.toBeNull();
  });
});
