import * as React from "react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/test/msw/server";
import { useOperatorLocations } from "./api";

const URL = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/location`;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useOperatorLocations (isolamento por empresa)", () => {
  it("filtra a query pelas empresas do usuário", async () => {
    let requestUrl = "";
    server.use(
      http.get(URL, ({ request }) => {
        requestUrl = request.url;
        return HttpResponse.json([]);
      }),
    );

    const { result } = renderHook(() => useOperatorLocations(["virapark-id"]), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Regressão: precisa amarrar por company_id. Sem isso, o operador via unidades de todas
    // as empresas (o RLS de location tem policy de catálogo pública).
    expect(requestUrl).toContain("company_id=in.");
    expect(requestUrl).toContain("virapark-id");
  });

  it("NÃO busca nada quando não há empresa no escopo", async () => {
    const hit = vi.fn(() => HttpResponse.json([]));
    server.use(http.get(URL, hit));

    const { result } = renderHook(() => useOperatorLocations([]), { wrapper });

    // Query desabilitada: nunca fica pending nem dispara request. É o que impede o "busca tudo".
    await new Promise((r) => setTimeout(r, 50));
    expect(hit).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("trata undefined como escopo vazio (não busca)", async () => {
    const hit = vi.fn(() => HttpResponse.json([]));
    server.use(http.get(URL, hit));

    renderHook(() => useOperatorLocations(undefined), { wrapper });

    await new Promise((r) => setTimeout(r, 50));
    expect(hit).not.toHaveBeenCalled();
  });
});
