import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useResolveGuaranteeClaim } from "./api";

describe("useResolveGuaranteeClaim", () => {
  it("manda id, desfecho, valor coberto e nota para a RPC", async () => {
    const espiao = rpc("admin_resolve_guarantee_claim", { json: { id: "g1", status: "relocated" } });
    const { result } = renderMutation(() => useResolveGuaranteeClaim());
    await result.current.mutateAsync({ id: "g1", status: "relocated", coveredCents: 1500, note: "vizinho" });
    expect(espiao.ultimoBody).toEqual({ p_id: "g1", p_status: "relocated", p_covered_cents: 1500, p_note: "vizinho" });
  });
  it("acionamento já fechado: a recusa chega", async () => {
    falha("rpc", "admin_resolve_guarantee_claim", 400, "Acionamento não encontrado ou já fechado.");
    const { result } = renderMutation(() => useResolveGuaranteeClaim());
    await expect(result.current.mutateAsync({ id: "g1", status: "dismissed", coveredCents: 0, note: null })).rejects.toThrow(/já fechado/);
  });
});
