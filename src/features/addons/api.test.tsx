import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import { buildAddonUpsertArgs, type AddonFormValues } from "./addons.logic";
import { useDeleteAddon, useSetLocationAddon, useUpsertAddon } from "./api";

/**
 * Contrato de rede dos serviços adicionais. Eles entram no total da reserva, então o
 * preço que sai daqui é o preço que o cliente paga.
 */

const FORM: AddonFormValues = {
  name: "Lava-jato",
  description: "",
  base_price: 30,
  is_active: true,
  sort_order: 0,
};

describe("useUpsertAddon", () => {
  it("manda os argumentos montados pelo builder, sem perder campo", async () => {
    const args = buildAddonUpsertArgs("c1", null, FORM);
    const espiao = rpc("operator_upsert_addon", { json: "add-1" });

    const { result } = renderMutation(() => useUpsertAddon("c1"));
    const id = await result.current.mutateAsync(args);

    expect(espiao.ultimoBody).toEqual(args);
    expect(id).toBe("add-1");
  });

  it("editar manda o id; criar manda null", async () => {
    const espiao = rpc("operator_upsert_addon", { json: "add-1" });

    const { result } = renderMutation(() => useUpsertAddon("c1"));
    await result.current.mutateAsync(buildAddonUpsertArgs("c1", null, FORM));
    expect((espiao.ultimoBody as { p_id: unknown }).p_id).toBeNull();

    await result.current.mutateAsync(buildAddonUpsertArgs("c1", "add-9", FORM));
    expect((espiao.ultimoBody as { p_id: unknown }).p_id).toBe("add-9");
  });
});

describe("useSetLocationAddon", () => {
  it("liga o serviço numa unidade, com o preço sobrescrito", async () => {
    const espiao = rpc("operator_set_location_addon", { json: null });

    const { result } = renderMutation(() => useSetLocationAddon("c1"));
    await result.current.mutateAsync({
      p_add_on_service_id: "add-9",
      p_location_id: "l1",
      p_is_active: true,
      p_price_override: 45,
    });

    expect(espiao.ultimoBody).toEqual({
      p_add_on_service_id: "add-9",
      p_location_id: "l1",
      p_is_active: true,
      p_price_override: 45,
    });
  });

  it("override nulo chega como null: é assim que a unidade volta ao preço base", async () => {
    // Se o campo sumisse do payload em vez de ir null, a RPC manteria o override
    // antigo e a unidade seguiria cobrando o preço que o parceiro acabou de tirar.
    const espiao = rpc("operator_set_location_addon", { json: null });

    const { result } = renderMutation(() => useSetLocationAddon("c1"));
    await result.current.mutateAsync({
      p_add_on_service_id: "add-9",
      p_location_id: "l1",
      p_is_active: true,
      p_price_override: null,
    });

    expect(espiao.ultimoBody).toHaveProperty("p_price_override", null);
  });

  it("desligar numa unidade manda false", async () => {
    const espiao = rpc("operator_set_location_addon", { json: null });

    const { result } = renderMutation(() => useSetLocationAddon("c1"));
    await result.current.mutateAsync({
      p_add_on_service_id: "add-9",
      p_location_id: "l1",
      p_is_active: false,
      p_price_override: null,
    });

    expect(espiao.ultimoBody).toHaveProperty("p_is_active", false);
  });
});

describe("useDeleteAddon", () => {
  it("exclui pelo id do serviço", async () => {
    const espiao = rpc("operator_delete_addon", { json: null });

    const { result } = renderMutation(() => useDeleteAddon("c1"));
    await result.current.mutateAsync("add-9");

    expect(espiao.ultimoBody).toEqual({ p_add_on_service_id: "add-9" });
  });

  it("serviço já vendido: a recusa da RPC chega legível", async () => {
    falha("rpc", "operator_delete_addon", 400, "serviço já usado em reserva");

    const { result } = renderMutation(() => useDeleteAddon("c1"));
    await expect(result.current.mutateAsync("add-9")).rejects.toThrow(/já usado/);
  });
});
