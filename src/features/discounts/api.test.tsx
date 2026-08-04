import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import {
  buildDiscountUpsertArgs,
  EMPTY_DISCOUNT_FORM,
  type DiscountFormValues,
} from "./discounts.logic";
import { useDeleteDiscount, useSetDiscountActive, useUpsertDiscount } from "./api";

/**
 * Contrato de rede dos descontos por regra. Diferente do cupom, que a pessoa digita,
 * o desconto aplica sozinho quando a reserva bate a condição. Errar aqui não gera
 * reclamação: gera receita a menos, calada.
 */

const FORM: DiscountFormValues = {
  ...EMPTY_DISCOUNT_FORM,
  name: "Promo 20",
  discount_type: "percent",
  discount_value: 20,
};

describe("useUpsertDiscount", () => {
  it("manda os argumentos montados pelo builder, sem perder campo", async () => {
    const args = buildDiscountUpsertArgs("c1", null, FORM);
    const espiao = rpc("operator_upsert_discount", { json: "dsc-1" });

    const { result } = renderMutation(() => useUpsertDiscount("c1"));
    const id = await result.current.mutateAsync(args);

    expect(espiao.ultimoBody).toEqual(args);
    expect(id).toBe("dsc-1");
  });

  it("editar manda o id; criar manda null", async () => {
    const espiao = rpc("operator_upsert_discount", { json: "dsc-1" });

    const { result } = renderMutation(() => useUpsertDiscount("c1"));
    await result.current.mutateAsync(buildDiscountUpsertArgs("c1", null, FORM));
    expect((espiao.ultimoBody as { p_id: unknown }).p_id).toBeNull();

    await result.current.mutateAsync(buildDiscountUpsertArgs("c1", "dsc-9", FORM));
    expect((espiao.ultimoBody as { p_id: unknown }).p_id).toBe("dsc-9");
  });

  it("propaga a recusa do servidor", async () => {
    falha("rpc", "operator_upsert_discount", 400, "regra sobreposta");

    const { result } = renderMutation(() => useUpsertDiscount("c1"));
    await expect(
      result.current.mutateAsync(buildDiscountUpsertArgs("c1", null, FORM)),
    ).rejects.toThrow(/sobreposta/);
  });
});

describe("useSetDiscountActive", () => {
  it("desativar manda false, e o false não se perde", async () => {
    // Desativar é como o parceiro para uma promoção que está saindo cara. Se o campo
    // sumisse, a regra continuaria descontando enquanto a tela mostra desligada.
    const espiao = rpc("operator_set_discount_active", { json: null });

    const { result } = renderMutation(() => useSetDiscountActive("c1"));
    await result.current.mutateAsync({ id: "dsc-9", is_active: false });

    expect(espiao.ultimoBody).toEqual({ p_discount_rule_id: "dsc-9", p_is_active: false });
  });
});

describe("useDeleteDiscount", () => {
  it("exclui pelo id da regra", async () => {
    const espiao = rpc("operator_delete_discount", { json: null });

    const { result } = renderMutation(() => useDeleteDiscount("c1"));
    await result.current.mutateAsync("dsc-9");

    expect(espiao.ultimoBody).toEqual({ p_discount_rule_id: "dsc-9" });
  });
});
