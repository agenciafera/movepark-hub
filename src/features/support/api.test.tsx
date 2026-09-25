import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { edge, falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useCloseSupportTicket, useOpenSupportTicket } from "./api";

describe("useOpenSupportTicket", () => {
  it("manda reserva, motivo e mensagem à Edge com o JWT", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({ data: { session: { access_token: "jwt-cliente" } }, error: null } as never);
    const espiao = edge("open-support-ticket", { json: { code: "CH-K7M2PX", whatsapp: true } });
    const { result } = renderMutation(() => useOpenSupportTicket());
    const r = await result.current.mutateAsync({ booking_code: "MP-8C497E", kind: "complaint", message: "O portão estava fechado." });
    expect(r).toEqual({ code: "CH-K7M2PX", whatsapp: true });
    expect(espiao.ultimoBody).toEqual({ booking_code: "MP-8C497E", kind: "complaint", message: "O portão estava fechado." });
    expect(espiao.chamadas[0].headers.get("authorization")).toBe("Bearer jwt-cliente");
  });

  it("propaga o erro da Edge", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({ data: { session: { access_token: "jwt-cliente" } }, error: null } as never);
    falha("edge", "open-support-ticket", 404, "Reserva não encontrada.");
    const { result } = renderMutation(() => useOpenSupportTicket());
    await expect(result.current.mutateAsync({ booking_code: "MP-X", kind: "other", message: "mensagem valida aqui" })).rejects.toThrow(/não encontrada/);
  });
});

describe("useCloseSupportTicket", () => {
  it("chama a RPC com o id", async () => {
    const espiao = rpc("admin_close_support_ticket", { status: 204 });
    const { result } = renderMutation(() => useCloseSupportTicket());
    await result.current.mutateAsync("t1");
    expect(espiao.ultimoBody).toEqual({ p_id: "t1" });
  });
});
