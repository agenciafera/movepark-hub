import { describe, expect, it, vi } from "vitest";
import { edge, falha, renderMutation, rpc, tabela } from "@/test/msw/supabase";
import { supabase } from "@/lib/supabase";
import { useCancelBooking, useMockPayment, useRenewBookingHold } from "./api";

/**
 * Contrato de rede dos hooks de escrita do checkout.
 *
 * Prova o que o cliente manda e como ele trata a resposta. A regra em si (a
 * capacidade volta mesmo? o hold renova?) é do banco e vive no pgTAP; aqui o
 * alvo é o payload e a propagação de erro, que é onde mora o bug de front.
 */

describe("useCancelBooking", () => {
  it("libera a capacidade antes de marcar a reserva", async () => {
    const release = rpc("release_booking_capacity", { json: null });
    const patch = tabela("booking", "patch", { json: [] });

    const { result } = renderMutation(() => useCancelBooking());
    await result.current.mutateAsync({ bookingId: "b-1" });

    expect(release.chamadas).toHaveLength(1);
    expect(release.ultimoBody).toEqual({ p_booking_id: "b-1" });
    expect(patch.chamadas).toHaveLength(1);
  });

  it("abandono vira 'expired', nunca 'cancelled'", async () => {
    // Regra de negócio, não detalhe: carrinho largado contando como cancelamento
    // inflava a taxa que o dono vê no painel (furo F4). Se alguém trocar por
    // 'cancelled' aqui, este teste cai.
    rpc("release_booking_capacity", { json: null });
    const patch = tabela("booking", "patch", { json: [] });

    const { result } = renderMutation(() => useCancelBooking());
    await result.current.mutateAsync({ bookingId: "b-1" });

    const body = patch.ultimoBody as { status: string; deleted_at: string };
    expect(body.status).toBe("expired");
    expect(body.deleted_at).toBeTruthy();
  });

  it("filtra pelo id da reserva no update", async () => {
    rpc("release_booking_capacity", { json: null });
    const patch = tabela("booking", "patch", { json: [] });

    const { result } = renderMutation(() => useCancelBooking());
    await result.current.mutateAsync({ bookingId: "b-42" });

    expect(patch.chamadas[0].url).toContain("id=eq.b-42");
  });

  it("propaga o erro do update", async () => {
    rpc("release_booking_capacity", { json: null });
    falha("tabela", "booking", 403, "sem permissão");

    const { result } = renderMutation(() => useCancelBooking());
    await expect(result.current.mutateAsync({ bookingId: "b-1" })).rejects.toThrow();
  });
});

describe("useRenewBookingHold", () => {
  it("chama a RPC com o id e devolve o resultado", async () => {
    const espiao = rpc("renew_booking_hold", { json: { ok: true, expires_at: "2026-08-01T00:00:00Z" } });

    const { result } = renderMutation(() => useRenewBookingHold());
    const res = await result.current.mutateAsync("b-9");

    expect(espiao.ultimoBody).toEqual({ p_booking_id: "b-9" });
    expect(res).toEqual({ ok: true, expires_at: "2026-08-01T00:00:00Z" });
  });

  it("propaga o erro da RPC", async () => {
    falha("rpc", "renew_booking_hold", 400, "hold já expirou");

    const { result } = renderMutation(() => useRenewBookingHold());
    await expect(result.current.mutateAsync("b-9")).rejects.toThrow();
  });
});

describe("useMockPayment", () => {
  function comSessao(token: string | null) {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: token ? ({ access_token: token } as never) : null },
      error: null,
    } as never);
  }

  it("recusa sem sessão, antes de tocar a rede", async () => {
    comSessao(null);
    const espiao = edge("mock-payment", { json: { ok: true } });

    const { result } = renderMutation(() => useMockPayment());
    await expect(result.current.mutateAsync({ booking_code: "MP-1", method: "pix" })).rejects.toThrow(
      "Você precisa estar logado",
    );
    expect(espiao.chamadas).toHaveLength(0);
  });

  it("manda o código e o método, com o Bearer da sessão", async () => {
    comSessao("token-de-teste");
    const espiao = edge("mock-payment", { json: { ok: true, status: "paid" } });

    const { result } = renderMutation(() => useMockPayment());
    await result.current.mutateAsync({ booking_code: "MP-1024", method: "pix" });

    expect(espiao.ultimoBody).toEqual({ booking_code: "MP-1024", method: "pix" });
    expect(espiao.chamadas[0].headers.get("authorization")).toBe("Bearer token-de-teste");
  });

  it("usa a mensagem do servidor quando o pagamento falha", async () => {
    comSessao("token-de-teste");
    edge("mock-payment", { status: 422, json: { error: "Cartão recusado" } });

    const { result } = renderMutation(() => useMockPayment());
    await expect(
      result.current.mutateAsync({ booking_code: "MP-1", method: "card", card_number: "4242" }),
    ).rejects.toThrow("Cartão recusado");
  });

  it("cai no HTTP quando o servidor não manda mensagem", async () => {
    comSessao("token-de-teste");
    edge("mock-payment", { status: 500, json: {} });

    const { result } = renderMutation(() => useMockPayment());
    await expect(result.current.mutateAsync({ booking_code: "MP-1", method: "pix" })).rejects.toThrow(
      /HTTP 500/,
    );
  });
});
