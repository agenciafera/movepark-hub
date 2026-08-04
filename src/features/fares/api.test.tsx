import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { edge, renderMutation } from "@/test/msw/supabase";
import { useCreateFareUpgrade } from "./api";

/**
 * Contrato de rede do upgrade de tarifa. É uma cobrança nova sobre uma reserva já
 * paga: a pessoa sobe de básica para flex pagando só a diferença. O valor é calculado
 * no servidor, e é isso que este arquivo prende.
 */

function comSessao(token: string | null) {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: token ? ({ access_token: token } as never) : null },
    error: null,
  } as never);
}

describe("useCreateFareUpgrade", () => {
  it("manda o código da reserva e a tarifa de destino", async () => {
    comSessao("token-de-teste");
    const espiao = edge("create-fare-upgrade", { json: { ok: true, amount_cents: 1500 } });

    const { result } = renderMutation(() => useCreateFareUpgrade());
    await result.current.mutateAsync({ booking_code: "MP7K2X", target_tier: "flex" });

    expect(espiao.ultimoBody).toEqual({ booking_code: "MP7K2X", target_tier: "flex" });
  });

  it("o valor NÃO vai no pedido: quem calcula a diferença é o servidor", async () => {
    // Se a tela mandasse o valor, dava para pedir upgrade de superflex pagando um
    // centavo. O cliente diz para onde quer ir; o preço disso é decisão do servidor.
    comSessao("token-de-teste");
    const espiao = edge("create-fare-upgrade", { json: { ok: true } });

    const { result } = renderMutation(() => useCreateFareUpgrade());
    await result.current.mutateAsync({ booking_code: "MP7K2X", target_tier: "superflex" });

    const corpo = JSON.stringify(espiao.ultimoBody);
    expect(corpo).not.toContain("amount");
    expect(corpo).not.toContain("price");
  });

  it("sem sessão, nem chega a pedir", async () => {
    comSessao(null);
    const espiao = edge("create-fare-upgrade", { json: {} });

    const { result } = renderMutation(() => useCreateFareUpgrade());
    await expect(
      result.current.mutateAsync({ booking_code: "MP7K2X", target_tier: "flex" }),
    ).rejects.toThrow();
    expect(espiao.chamadas).toHaveLength(0);
  });

  it("recusa do servidor sobe com a mensagem dele", async () => {
    comSessao("token-de-teste");
    edge("create-fare-upgrade", {
      status: 400,
      json: { error: "A reserva já começou" },
    });

    const { result } = renderMutation(() => useCreateFareUpgrade());
    await expect(
      result.current.mutateAsync({ booking_code: "MP7K2X", target_tier: "flex" }),
    ).rejects.toThrow(/já começou/);
  });
});
