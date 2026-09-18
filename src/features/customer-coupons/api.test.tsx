import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import {
  useApplyCouponToBooking,
  useRedeemCoupon,
  useRemoveCouponFromBooking,
} from "./api";

/**
 * Contrato de rede da carteira de cupons.
 *
 * O que mais dói aqui não é erro de rede, é o cupom que a pessoa escolheu não chegar na reserva:
 * ela vê o desconto na tela, paga o valor cheio e descobre depois. Por isso os casos abaixo
 * cobram o payload exato de cada RPC.
 *
 * As três RPCs devolvem `{ ok, error_code }` em vez de estourar: recusa de regra (cupom expirado,
 * fora da audiência) é resposta esperada, não falha. O `mutateAsync` só rejeita quando a rede
 * quebra de verdade, e os testes separam as duas coisas.
 */

describe("useRedeemCoupon", () => {
  it("manda o código para a RPC de resgate", async () => {
    const espiao = rpc("coupon_redeem", { json: { ok: true, code: "VOLTA20" } });

    const { result } = renderMutation(() => useRedeemCoupon());
    const res = await result.current.mutateAsync("VOLTA20");

    expect(espiao.ultimoBody).toEqual({ p_code: "VOLTA20" });
    expect(res.ok).toBe(true);
  });

  it("código recusado volta como resultado, não como exceção", async () => {
    // O campo de resgate precisa mostrar "Não encontramos esse código" em vez de um erro genérico,
    // e para isso a recusa tem que chegar como dado.
    rpc("coupon_redeem", { json: { ok: false, error_code: "invalid" } });

    const { result } = renderMutation(() => useRedeemCoupon());
    const res = await result.current.mutateAsync("NAOEXISTE");

    expect(res.ok).toBe(false);
    expect(res.error_code).toBe("invalid");
  });

  it("propaga falha de rede", async () => {
    falha("rpc", "coupon_redeem", 500, "servidor fora");

    const { result } = renderMutation(() => useRedeemCoupon());
    await expect(result.current.mutateAsync("VOLTA20")).rejects.toThrow(/fora/);
  });
});

describe("useApplyCouponToBooking", () => {
  it("manda reserva e código juntos: sem os dois o desconto cai na reserva errada", async () => {
    const espiao = rpc("apply_coupon_to_booking", {
      json: { ok: true, code: "BEMVINDO30", discount: 40, total_amount: 160 },
    });

    const { result } = renderMutation(() => useApplyCouponToBooking());
    const res = await result.current.mutateAsync({ bookingId: "bk-1", code: "BEMVINDO30" });

    expect(espiao.ultimoBody).toEqual({ p_booking_id: "bk-1", p_code: "BEMVINDO30" });
    expect(res.total_amount).toBe(160);
  });

  it("cupom fora da audiência volta com o motivo, para a tela explicar", async () => {
    rpc("apply_coupon_to_booking", { json: { ok: false, error_code: "not_first_purchase" } });

    const { result } = renderMutation(() => useApplyCouponToBooking());
    const res = await result.current.mutateAsync({ bookingId: "bk-1", code: "BEMVINDO30" });

    expect(res.ok).toBe(false);
    expect(res.error_code).toBe("not_first_purchase");
  });

  it("propaga falha de rede", async () => {
    falha("rpc", "apply_coupon_to_booking", 500, "servidor fora");

    const { result } = renderMutation(() => useApplyCouponToBooking());
    await expect(
      result.current.mutateAsync({ bookingId: "bk-1", code: "BEMVINDO30" }),
    ).rejects.toThrow(/fora/);
  });
});

describe("useRemoveCouponFromBooking", () => {
  it("remove pelo id da reserva e devolve o total sem desconto", async () => {
    // "Não usar o cupom" tem que devolver o total cheio. Se o valor voltasse errado, o cliente
    // pagaria um número diferente do que a tela mostra.
    const espiao = rpc("remove_coupon_from_booking", { json: { ok: true, total_amount: 200 } });

    const { result } = renderMutation(() => useRemoveCouponFromBooking());
    const res = await result.current.mutateAsync("bk-1");

    expect(espiao.ultimoBody).toEqual({ p_booking_id: "bk-1" });
    expect(res.total_amount).toBe(200);
  });

  it("propaga falha de rede", async () => {
    falha("rpc", "remove_coupon_from_booking", 500, "servidor fora");

    const { result } = renderMutation(() => useRemoveCouponFromBooking());
    await expect(result.current.mutateAsync("bk-1")).rejects.toThrow(/fora/);
  });
});
