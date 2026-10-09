import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { useBookingsPage, useReconcileBookingFees, useRecordFlightCheckout } from "./api";
import { supabase } from "@/lib/supabase";
import { edge, falha, renderMutation, rpc } from "@/test/msw/supabase";
import { vi } from "vitest";

const SUPABASE_URL = "http://localhost:54321";

describe("useBookingsPage (lista única, 09/10/2026)", () => {
  it("manda os filtros com o nome certo de parâmetro e a página como offset", async () => {
    const fn = rpc("bookings_list_page", { json: { total: 0, items: [], summary: null } });
    const { result } = renderMutation(() =>
      useBookingsPage({
        source: "wl",
        status: ["completed"],
        locationIds: ["loc-1"],
        companyIds: ["c-1"],
        dateField: "created_at",
        from: "2026-10-01T00:00:00Z",
        search: " ana ",
        channel: "site",
        paymentMethod: "pix",
        partnerView: true,
        page: 2,
        pageSize: 50,
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fn.ultimoBody).toEqual({
      p_source: "wl",
      p_statuses: ["completed"],
      p_location_ids: ["loc-1"],
      p_company_ids: ["c-1"],
      p_date_field: "created_at",
      p_from: "2026-10-01T00:00:00Z",
      p_to: null,
      p_search: "ana",
      p_payment: "pix",
      p_channel_origins: ["hub_search", "hub_destino", "hub_direct"],
      p_partner_view: true,
      p_limit: 50,
      p_offset: 100,
    });
  });

  // A reserva do Hub volta só com o id e é montada com o select de sempre; a ordem é a do
  // servidor (compra mais recente primeiro), não a de chegada da segunda consulta.
  it("monta a reserva do Hub e mantém a ordem do servidor, misturando as origens", async () => {
    rpc("bookings_list_page", {
      json: {
        total: 3,
        items: [
          { source: "hub", id: "b2" },
          { source: "wl", id: "w1", wl: { id: "w1", wl_order_number: "271001-0001" } },
          { source: "hub", id: "b1" },
        ],
        summary: { hub: { total: 2 }, wl: { total: 1 } },
      },
    });
    let capturedUrl = "";
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/booking`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([
          { id: "b1", code: "MP-B1" },
          { id: "b2", code: "MP-B2" },
        ]);
      }),
    );
    const { result } = renderMutation(() => useBookingsPage({ page: 0, pageSize: 50 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(decodeURIComponent(capturedUrl)).toContain("id=in.(b2,b1)");
    // Regressão do F1: a lista não filtra deleted_at (a cancelada carrega a data).
    expect(decodeURIComponent(capturedUrl)).not.toContain("deleted_at");
    const rows = result.current.data!.rows;
    expect(rows.map((r) => r.source)).toEqual(["hub", "wl", "hub"]);
    expect(rows[0].source === "hub" && rows[0].booking.code).toBe("MP-B2");
    expect(rows[1].source === "wl" && rows[1].wl.wl_order_number).toBe("271001-0001");
    expect(result.current.data!.total).toBe(3);
  });

  it("página só com reserva do site não consulta booking", async () => {
    rpc("bookings_list_page", { json: { total: 1, items: [{ source: "wl", id: "w1", wl: { id: "w1" } }] } });
    let consultou = false;
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/booking`, () => {
        consultou = true;
        return HttpResponse.json([]);
      }),
    );
    const { result } = renderMutation(() => useBookingsPage({ page: 0, pageSize: 50 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(consultou).toBe(false);
    expect(result.current.data!.summary.wl.total).toBe(0);
  });

  it("deixa o erro do servidor chegar", async () => {
    falha("rpc", "bookings_list_page", 403, "Autenticação necessária.");
    const { result } = renderMutation(() => useBookingsPage({ page: 0, pageSize: 50 }));
    await waitFor(() => expect(result.current.isError).toBe(true));
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
