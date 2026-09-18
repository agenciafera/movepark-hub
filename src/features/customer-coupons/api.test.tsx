import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import {
  useApplyCouponToBooking,
  useRedeemCoupon,
  useRemoveCouponFromBooking,
  useSetPlatformCouponActive,
  useUpsertPlatformCoupon,
} from "./api";
import {
  buildPlatformCouponArgs,
  EMPTY_PLATFORM_COUPON_FORM,
} from "./platformCoupons.logic";

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

describe("useUpsertPlatformCoupon", () => {
  it("manda os argumentos montados pelo builder, sem perder campo", async () => {
    const args = buildPlatformCouponArgs(null, {
      ...EMPTY_PLATFORM_COUPON_FORM,
      code: "BEMVINDO30",
      discount_type: "percent",
      discount_value: 30,
      max_discount_amount: 40,
      audience: "first_purchase",
    });
    const espiao = rpc("manager_upsert_platform_coupon", { json: "cup-1" });

    const { result } = renderMutation(() => useUpsertPlatformCoupon());
    const id = await result.current.mutateAsync(args);

    expect(espiao.ultimoBody).toEqual(args);
    expect(id).toBe("cup-1");
  });

  it("propaga a recusa do servidor, que e quem manda no teto", async () => {
    // O front ja valida, mas a RPC e a autoridade: um percentual sem teto que passasse pela tela
    // ainda seria barrado aqui, e a mensagem precisa chegar no gestor.
    falha("rpc", "manager_upsert_platform_coupon", 400, "exige teto (max_discount_amount)");

    const { result } = renderMutation(() => useUpsertPlatformCoupon());
    await expect(
      result.current.mutateAsync(
        buildPlatformCouponArgs(null, {
          ...EMPTY_PLATFORM_COUPON_FORM,
          code: "X",
          discount_value: 30,
        }),
      ),
    ).rejects.toThrow(/teto/);
  });
});

describe("useSetPlatformCouponActive", () => {
  it("pausar manda false, e o false nao se perde", async () => {
    // Pausar e o gesto urgente: se o campo sumisse, a campanha continuaria descontando enquanto a
    // tela mostra desligada.
    const espiao = rpc("manager_set_platform_coupon_active", { json: null });

    const { result } = renderMutation(() => useSetPlatformCouponActive());
    await result.current.mutateAsync({ id: "cup-9", is_active: false });

    expect(espiao.ultimoBody).toEqual({ p_coupon_id: "cup-9", p_is_active: false });
  });

  it("propaga a recusa de quem nao e hub_admin", async () => {
    falha("rpc", "manager_set_platform_coupon_active", 403, "Apenas a equipe Movepark");

    const { result } = renderMutation(() => useSetPlatformCouponActive());
    await expect(
      result.current.mutateAsync({ id: "cup-9", is_active: true }),
    ).rejects.toThrow(/Movepark/);
  });
});
