import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useSetLocationAmenities } from "./api";

/**
 * Contrato de rede das comodidades da unidade. Elas viram filtro na busca e selo no
 * card, então marcar "coberto" numa unidade descoberta não é erro de cadastro: é
 * promessa quebrada na chegada.
 */

describe("useSetLocationAmenities", () => {
  it("manda a unidade e a lista de códigos", async () => {
    const espiao = rpc("operator_set_location_amenities", { json: null });

    const { result } = renderMutation(() => useSetLocationAmenities());
    await result.current.mutateAsync({ locationId: "l1", codes: ["coberto", "24h"] });

    expect(espiao.ultimoBody).toEqual({ p_location_id: "l1", p_codes: ["coberto", "24h"] });
  });

  it("a lista vai como está: é substituição, não acréscimo", async () => {
    // A RPC troca o conjunto. Se a tela mandasse só o que marcou, desmarcar uma
    // comodidade não tiraria nada, e o selo continuaria no card.
    const espiao = rpc("operator_set_location_amenities", { json: null });

    const { result } = renderMutation(() => useSetLocationAmenities());
    await result.current.mutateAsync({ locationId: "l1", codes: ["24h"] });

    expect((espiao.ultimoBody as { p_codes: string[] }).p_codes).toEqual(["24h"]);
  });

  it("lista vazia é pedido legítimo: tira todas as comodidades", async () => {
    const espiao = rpc("operator_set_location_amenities", { json: null });

    const { result } = renderMutation(() => useSetLocationAmenities());
    await result.current.mutateAsync({ locationId: "l1", codes: [] });

    expect((espiao.ultimoBody as { p_codes: string[] }).p_codes).toEqual([]);
  });

  it("propaga a recusa do servidor", async () => {
    falha("rpc", "operator_set_location_amenities", 403, "sem permissão");

    const { result } = renderMutation(() => useSetLocationAmenities());
    await expect(
      result.current.mutateAsync({ locationId: "l1", codes: ["24h"] }),
    ).rejects.toThrow();
  });
});
