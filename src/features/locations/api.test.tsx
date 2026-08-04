import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import { useSetCheckoutMode } from "./api";

/**
 * Contrato do cliente para a virada de checkout (E0.14). O que o servidor decide
 * (hub_admin, pré-voo, carimbo) é pgTAP: supabase/tests/checkout_mode_external.test.sql.
 */
describe("useSetCheckoutMode", () => {
  it("manda só checkout_mode no patch da unidade", async () => {
    const patch = tabela("location", "patch", { json: [{ id: "loc-1", checkout_mode: "external" }] });
    const { result } = renderMutation(() => useSetCheckoutMode());

    await result.current.mutateAsync({ id: "loc-1", mode: "external" });

    expect(patch.chamadas.length).toBe(1);
    expect(patch.ultimoBody).toEqual({ checkout_mode: "external" });
    expect(patch.chamadas[0].url).toContain("id=eq.loc-1");
  });

  it("propaga a recusa do banco em vez de engolir", async () => {
    falha("tabela", "location", 403, "checkout_mode só pode ser alterado por hub_admin");
    const { result } = renderMutation(() => useSetCheckoutMode());

    await expect(result.current.mutateAsync({ id: "loc-1", mode: "external" })).rejects.toThrow(
      /hub_admin/,
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
