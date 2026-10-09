import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { edge, falha, renderMutation, rpc } from "@/test/msw/supabase";
import { supabase } from "@/lib/supabase";
import { useWlBookingAction, useWlBookingActions } from "./api";

function comSessao() {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: { access_token: "token-de-teste" } as never },
    error: null,
  } as never);
}

describe("useWlBookingActions", () => {
  it("lê o que quem está logado pode fazer na empresa", async () => {
    const fn = rpc("wl_booking_my_actions", { json: { enabled: true, attendance: true, license_plate: false } });
    const { result } = renderMutation(() => useWlBookingActions("c-1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fn.ultimoBody).toEqual({ p_company_id: "c-1" });
    expect(result.current.data).toEqual({ enabled: true, attendance: true, license_plate: false });
  });
});

describe("useWlBookingAction", () => {
  it("manda o comparecimento no contrato da Edge", async () => {
    comSessao();
    const fn = edge("wl-booking-action", { json: { ok: true, attendance_status: "no_show" } });
    const { result } = renderMutation(() => useWlBookingAction());
    await result.current.mutateAsync({ action: "attendance", wlBookingId: "w-1", status: "no_show" });
    expect(fn.ultimoBody).toEqual({ action: "attendance", wl_booking_id: "w-1", status: "no_show" });
  });

  it("manda a troca de placa com o motivo", async () => {
    comSessao();
    const fn = edge("wl-booking-action", { json: { ok: true, license_plate: "XYZ9K88" } });
    const { result } = renderMutation(() => useWlBookingAction());
    await result.current.mutateAsync({
      action: "license_plate",
      wlBookingId: "w-1",
      licensePlate: "XYZ9K88",
      reason: "carro da esposa",
    });
    expect(fn.ultimoBody).toMatchObject({
      action: "license_plate",
      wl_booking_id: "w-1",
      license_plate: "XYZ9K88",
      reason: "carro da esposa",
    });
  });

  it("a recusa do site chega com a mensagem pronta", async () => {
    comSessao();
    falha("edge", "wl-booking-action", 409, "Só reserva paga aceita essa ação.");
    const { result } = renderMutation(() => useWlBookingAction());
    await expect(
      result.current.mutateAsync({ action: "attendance", wlBookingId: "w-1", status: "compareceu" }),
    ).rejects.toThrow("Só reserva paga aceita essa ação.");
  });
});
