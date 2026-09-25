import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { useBookings, useReconcileBookingFees, useRecordFlightCheckout } from "./api";
import { supabase } from "@/lib/supabase";
import { edge, falha, renderMutation, rpc } from "@/test/msw/supabase";
import { vi } from "vitest";

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

  // Manager › Reservas recorta pela data da COMPRA (decidido em 16/09/2026): reserva feita
  // hoje para a semana que vem tem que aparecer hoje. O operador segue por check-in, que é o
  // que o pátio precisa; por isso o campo é escolha de quem chama, com check-in como padrão.
  it("dateField=created_at recorta e ordena pela data da compra", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/booking`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      }),
    );
    const { result } = renderHook(
      () =>
        useBookings({
          from: "2026-09-01T00:00:00.000Z",
          to: "2026-09-16T23:59:59.000Z",
          dateField: "created_at",
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = decodeURIComponent(capturedUrl);
    expect(url).toContain("created_at=gte.2026-09-01");
    expect(url).toContain("created_at=lte.2026-09-16");
    expect(url).toContain("order=created_at.desc");
    expect(url).not.toContain("check_in_at=gte");
  });

  it("sem dateField, o recorte continua pelo check-in", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/booking`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      }),
    );
    const { result } = renderHook(
      () => useBookings({ from: "2026-09-01T00:00:00.000Z", to: "2026-09-16T23:59:59.000Z" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = decodeURIComponent(capturedUrl);
    expect(url).toContain("check_in_at=gte.2026-09-01");
    expect(url).toContain("order=check_in_at.desc");
  });
});

describe("useReconcileBookingFees", () => {
  it("pede à Edge reconcile-gateway-fees a apuração de UMA reserva, com o JWT do hub_admin", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { access_token: "jwt" } as never }, error: null } as never);
    const chamada = edge("reconcile-gateway-fees", { json: { ok: true, checked: 1, updated: 1 } });
    const { result } = renderMutation(() => useReconcileBookingFees());
    const r = await result.current.mutateAsync("bk-1");
    expect(chamada.ultimoBody).toEqual({ booking_id: "bk-1" });
    expect(chamada.chamadas[0].headers.get("authorization")).toBe("Bearer jwt");
    expect(r.updated).toBe(1);
  });
  it("sem ser hub_admin a Edge recusa e a mensagem chega", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { access_token: "jwt" } as never }, error: null } as never);
    falha("edge", "reconcile-gateway-fees", 401, "unauthorized");
    const { result } = renderMutation(() => useReconcileBookingFees());
    await expect(result.current.mutateAsync("bk-1")).rejects.toThrow(/unauthorized/);
  });
});

describe("useRecordFlightCheckout", () => {
  it("manda reserva, saída real, cobrado e motivo à RPC", async () => {
    const espiao = rpc("operator_record_flight_checkout", { json: { overage_cents: 2700, overage_charged_cents: 2700, actual_check_out_at: "2026-12-14T13:00:00Z" } });
    const { result } = renderMutation(() => useRecordFlightCheckout());
    const r = await result.current.mutateAsync({ bookingId: "b1", actualCheckOutAt: "2026-12-14T13:00:00Z", chargedCents: 2700, note: null });
    expect(espiao.ultimoBody).toEqual({ p_booking_id: "b1", p_actual_check_out_at: "2026-12-14T13:00:00Z", p_overage_charged_cents: 2700 });
    expect(r.overage_cents).toBe(2700);
  });
  it("propaga a recusa da RPC", async () => {
    falha("rpc", "operator_record_flight_checkout", 400, "A saída real desta reserva já foi registrada.");
    const { result } = renderMutation(() => useRecordFlightCheckout());
    await expect(result.current.mutateAsync({ bookingId: "b1", actualCheckOutAt: "2026-12-14T13:00:00Z", chargedCents: 0, note: "x" })).rejects.toThrow(/já foi registrada/);
  });
});
