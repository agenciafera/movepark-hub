import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import { buildCouponUpsertArgs, EMPTY_COUPON_FORM, type CouponFormValues } from "./coupons.logic";
import { useDeleteCoupon, useSetCouponActive, useUpsertCoupon } from "./api";

/**
 * Contrato de rede dos cupons. O desconto sai do bolso do parceiro, então o que fica
 * preso aqui é que os argumentos chegam íntegros e que a recusa do servidor sobe.
 *
 * A validação do formulário já tem teste próprio em `coupons.logic.test.ts`. O que
 * faltava era a ponte: qual RPC, com quais argumentos.
 */

const FORM: CouponFormValues = {
  ...EMPTY_COUPON_FORM,
  code: "promo10",
  discount_type: "percent",
  discount_value: 10,
};

describe("useUpsertCoupon", () => {
  it("manda os argumentos montados pelo builder, sem perder campo", async () => {
    // O fixture passa pelo builder de verdade: montar o objeto à mão aqui deixaria o
    // teste verde no dia em que o cupom ganhasse um campo novo que a tela não envia.
    const args = buildCouponUpsertArgs("c1", null, FORM);
    const espiao = rpc("operator_upsert_coupon", { json: "cup-1" });

    const { result } = renderMutation(() => useUpsertCoupon("c1"));
    const id = await result.current.mutateAsync(args);

    expect(espiao.ultimoBody).toEqual(args);
    expect(id).toBe("cup-1");
  });

  it("editar manda o id; criar manda null", async () => {
    // É o mesmo endpoint para os dois. Se o id vazasse numa criação, a tela
    // sobrescreveria um cupom existente achando que criou outro.
    const espiao = rpc("operator_upsert_coupon", { json: "cup-1" });

    const { result } = renderMutation(() => useUpsertCoupon("c1"));
    await result.current.mutateAsync(buildCouponUpsertArgs("c1", null, FORM));
    expect((espiao.ultimoBody as { p_id: unknown }).p_id).toBeNull();

    await result.current.mutateAsync(buildCouponUpsertArgs("c1", "cup-9", FORM));
    expect((espiao.ultimoBody as { p_id: unknown }).p_id).toBe("cup-9");
  });

  it("código duplicado sobe com a mensagem do servidor", async () => {
    falha("rpc", "operator_upsert_coupon", 400, "já existe cupom com este código");

    const { result } = renderMutation(() => useUpsertCoupon("c1"));
    await expect(
      result.current.mutateAsync(buildCouponUpsertArgs("c1", null, FORM)),
    ).rejects.toThrow(/já existe cupom/);
  });
});

describe("useSetCouponActive", () => {
  it("desativar manda false, e o false não se perde no caminho", async () => {
    // Falso é o valor que desliga o cupom. Um `??` ou um spread condicional mal posto
    // faria a chamada sair sem o campo, e o cupom continuaria valendo.
    const espiao = rpc("operator_set_coupon_active", { json: null });

    const { result } = renderMutation(() => useSetCouponActive("c1"));
    await result.current.mutateAsync({ id: "cup-9", is_active: false });

    expect(espiao.ultimoBody).toEqual({ p_coupon_id: "cup-9", p_is_active: false });
  });

  it("ativar manda true", async () => {
    const espiao = rpc("operator_set_coupon_active", { json: null });

    const { result } = renderMutation(() => useSetCouponActive("c1"));
    await result.current.mutateAsync({ id: "cup-9", is_active: true });

    expect(espiao.ultimoBody).toEqual({ p_coupon_id: "cup-9", p_is_active: true });
  });
});

describe("useDeleteCoupon", () => {
  it("exclui pelo id, e só por ele", async () => {
    const espiao = rpc("operator_delete_coupon", { json: null });

    const { result } = renderMutation(() => useDeleteCoupon("c1"));
    await result.current.mutateAsync("cup-9");

    expect(espiao.ultimoBody).toEqual({ p_coupon_id: "cup-9" });
  });

  it("cupom já usado em reserva: a recusa da RPC chega legível", async () => {
    // Apagar cupom usado quebraria o histórico da reserva que o aplicou. A RPC barra,
    // e o parceiro precisa ler o motivo para saber que deve desativar em vez de excluir.
    falha("rpc", "operator_delete_coupon", 400, "cupom já usado em reserva");

    const { result } = renderMutation(() => useDeleteCoupon("c1"));
    await expect(result.current.mutateAsync("cup-9")).rejects.toThrow(/já usado/);
  });
});
