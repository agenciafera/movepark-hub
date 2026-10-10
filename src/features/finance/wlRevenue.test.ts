import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderMutation, rpc } from "@/test/msw/supabase";
import { normalizeWlRevenue, useWlRevenue } from "./wlRevenue";

describe("normalizeWlRevenue", () => {
  it("converte o numeric do Postgres", () => {
    const r = normalizeWlRevenue({
      total: { created: 4, paid: 3, paid_amount: "350.000" },
      by_day: [{ day: "2027-11-10", paid: 1, paid_amount: "150.0" }],
      by_company: [{ company_id: "c1", company_name: "A", created: 4, paid: 3, paid_amount: "350" }],
    });
    expect(r.total).toEqual({ created: 4, paid: 3, paid_amount: 350 });
    expect(r.by_day[0].paid_amount).toBe(150);
    expect(r.by_company[0].paid_amount).toBe(350);
  });

  it("resposta vazia vira zero", () => {
    expect(normalizeWlRevenue(null).total.paid_amount).toBe(0);
  });
});

describe("useWlRevenue", () => {
  it("manda o recorte com o nome certo de parâmetro", async () => {
    const fn = rpc("wl_revenue", { json: { total: {}, by_day: [], by_company: [] } });
    const { result } = renderMutation(() =>
      useWlRevenue({ from: "2027-11-01T00:00:00Z", to: "2027-12-01T00:00:00Z", locationIds: ["l1"], dateField: "created_at" }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fn.ultimoBody).toEqual({
      p_from: "2027-11-01T00:00:00Z",
      p_to: "2027-12-01T00:00:00Z",
      p_location_ids: ["l1"],
      p_company_ids: null,
      p_date_field: "created_at",
    });
  });
});
