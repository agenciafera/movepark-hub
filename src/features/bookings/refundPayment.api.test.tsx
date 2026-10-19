import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { edge, falha, renderMutation } from "@/test/msw/supabase";
import { useRefundPayment } from "./api";

// Estorno avulso (19/10/2026): contrato de rede da Edge refund-payment.
describe("useRefundPayment", () => {
  it("manda o pagamento e o motivo para a Edge e propaga a recusa da Pagar.me", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "jwt" } as never },
      error: null,
    } as never);
    const chamada = edge("refund-payment", { json: { ok: true, status: "refunded", refund_pending: false } });
    const { result } = renderMutation(() => useRefundPayment());
    const r = await result.current.mutateAsync({ paymentId: "p2", reason: "cobrança em dobro" });
    expect(chamada.ultimoBody).toEqual({ payment_id: "p2", reason: "cobrança em dobro" });
    expect(r.status).toBe("refunded");

    falha("edge", "refund-payment", 409, "A Pagar.me recusou o estorno (Saldo insuficiente.).");
    const { result: r2 } = renderMutation(() => useRefundPayment());
    await expect(r2.current.mutateAsync({ paymentId: "p2", reason: "cobrança em dobro" })).rejects.toThrow(/Saldo insuficiente/);
  });
});
