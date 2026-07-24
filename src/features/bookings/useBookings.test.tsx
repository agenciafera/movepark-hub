import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { useBookings } from "./api";

const SUPABASE_URL = "http://localhost:54321";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useBookings", () => {
  // Regressão do F1 (docs/testes/furos-visao-dono.md): a reserva cancelada carrega
  // `deleted_at`, então filtrar `deleted_at is null` na lista fazia o filtro "Cancelada"
  // do painel nunca listar nada. A RLS já restringe por empresa; a lista não pode filtrar
  // deleted_at.
  it("não filtra deleted_at na query e devolve a reserva cancelada", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/booking`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([
          {
            id: "b1",
            code: "MP-CANCEL",
            status: "cancelled",
            deleted_at: "2026-07-10T00:00:00Z",
            total_amount: 29.8,
            location: null,
          },
        ]);
      }),
    );

    const { result } = renderHook(() => useBookings({ status: ["cancelled"] }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(decodeURIComponent(capturedUrl)).not.toContain("deleted_at");
    expect(result.current.data?.[0]?.code).toBe("MP-CANCEL");
  });
});
