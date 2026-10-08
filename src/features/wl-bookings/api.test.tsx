import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useWlBookings, useWlBookingsCount } from "./api";

/**
 * Contrato de rede das reservas do site. Quem prova o recorte por empresa e o escopo é o pgTAP
 * (wl_booking_operator.test.sql); aqui, que os filtros chegam com o nome certo de parâmetro. Um
 * `p_company_id` trocado faria o admin impersonando ver todas as empresas.
 */
describe("useWlBookings", () => {
  it("manda empresa e filtros nos parâmetros da RPC", async () => {
    const fn = rpc("operator_wl_bookings", { json: [{ id: "w-1" }] });
    const { result } = renderMutation(() =>
      useWlBookings({ companyId: "c-1", status: "confirmed", search: "ABC", from: "2027-10-01T00:00:00" }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fn.ultimoBody).toEqual({
      p_company_id: "c-1",
      p_status: "confirmed",
      p_search: "ABC",
      p_from: "2027-10-01T00:00:00",
      p_to: null,
    });
    expect(result.current.data).toHaveLength(1);
  });

  it("deixa o erro do servidor chegar", async () => {
    falha("rpc", "operator_wl_bookings", 403, "Autenticação necessária.");
    const { result } = renderMutation(() => useWlBookings({}));
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useWlBookingsCount", () => {
  it("parceiro manda empresa nula e o servidor recorta", async () => {
    const fn = rpc("operator_wl_bookings_count", { json: 4 });
    const { result } = renderMutation(() => useWlBookingsCount(undefined));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fn.ultimoBody).toEqual({ p_company_id: null });
    expect(result.current.data).toBe(4);
  });
});
