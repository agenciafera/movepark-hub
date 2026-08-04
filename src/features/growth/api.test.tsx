import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useRedeemReferral } from "./api";

/**
 * Contrato de rede do resgate de indicação. O código vira crédito na carteira, então
 * é a única mutation do consumidor que cria dinheiro do lado dele.
 */

describe("useRedeemReferral", () => {
  it("manda o código para a RPC", async () => {
    const espiao = rpc("redeem_referral_code", { json: { ok: true } });

    const { result } = renderMutation(() => useRedeemReferral());
    await result.current.mutateAsync("QAWIND");

    expect(espiao.ultimoBody).toEqual({ p_code: "QAWIND" });
  });

  it("o valor do crédito não viaja no pedido: quem define é o servidor", async () => {
    // O valor da indicação é config do programa (`referral_reward_amount`). Se a tela
    // pudesse sugerir o valor, resgatar viraria escolher quanto ganhar.
    const espiao = rpc("redeem_referral_code", { json: { ok: true } });

    const { result } = renderMutation(() => useRedeemReferral());
    await result.current.mutateAsync("QAWIND");

    expect(Object.keys(espiao.ultimoBody as object)).toEqual(["p_code"]);
  });

  it("devolve o resultado da RPC para a tela decidir o que mostrar", async () => {
    // A RPC responde ok false com motivo em vez de estourar, porque código inválido é
    // caso comum e não erro de sistema.
    rpc("redeem_referral_code", { json: { ok: false, error: "código já usado" } });

    const { result } = renderMutation(() => useRedeemReferral());
    const r = await result.current.mutateAsync("QAWIND");

    expect(r).toEqual({ ok: false, error: "código já usado" });
  });

  it("erro de verdade sobe como exceção", async () => {
    falha("rpc", "redeem_referral_code", 500, "indisponível");

    const { result } = renderMutation(() => useRedeemReferral());
    await expect(result.current.mutateAsync("QAWIND")).rejects.toThrow();
  });
});
