import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useRetryWlDelivery, useWlHealth } from "./api";

/**
 * Contrato de rede da tela de saúde do white-label.
 *
 * Quem prova que só hub_admin lê e reenvia é o pgTAP (wl_integration_health.test.sql). Aqui a
 * pergunta é se o cliente manda o parâmetro com o nome certo e deixa o erro chegar: um `p_id`
 * escrito errado faria a RPC devolver `false` e a tela dizer "já não estava falha".
 */

const RELATORIO = {
  health: { ok: false, motivos: ["entrega_falhou"], entregas_falhas: 1 },
  deliveries: [{ id: "d-1", status: "failed" }],
  recent: { delivered_24h: 3, pending: 0, last_delivered_at: null },
  units: [],
};

describe("useWlHealth", () => {
  it("lê o relatório da RPC", async () => {
    rpc("manager_wl_health", { json: RELATORIO });
    const { result } = renderMutation(() => useWlHealth());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.health.motivos).toEqual(["entrega_falhou"]);
    expect(result.current.data!.deliveries).toHaveLength(1);
  });

  it("resposta sem resumo é erro, não 'tudo em dia'", async () => {
    rpc("manager_wl_health", { json: [] });
    const { result } = renderMutation(() => useWlHealth());
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("propaga a recusa de quem não é hub_admin", async () => {
    falha("rpc", "manager_wl_health", 403, "Apenas a equipe Movepark lê a saúde do white-label.");
    const { result } = renderMutation(() => useWlHealth());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain("Apenas a equipe Movepark");
  });
});

describe("useRetryWlDelivery", () => {
  it("manda o id da entrega em p_id e devolve se ela voltou para a fila", async () => {
    const fn = rpc("wl_delivery_retry", { json: true });
    const { result } = renderMutation(() => useRetryWlDelivery());
    result.current.mutate("d-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fn.ultimoBody).toEqual({ p_id: "d-1" });
    expect(result.current.data).toBe(true);
  });

  it("propaga a recusa do servidor", async () => {
    falha("rpc", "wl_delivery_retry", 403, "Apenas a equipe Movepark reenvia entregas ao white-label.");
    const { result } = renderMutation(() => useRetryWlDelivery());
    result.current.mutate("d-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
