import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useUpdateApiKeyScopes } from "./api";

/**
 * Contrato de rede dos escopos de uma chave de API (ADR-005). Escopo é a única coisa
 * que separa uma chave de leitura de uma que escreve preço e cancela reserva, e a
 * chave já está na mão de um terceiro quando isso é editado.
 */

describe("useUpdateApiKeyScopes", () => {
  it("manda a chave e a lista de escopos", async () => {
    const espiao = rpc("operator_update_api_key_scopes", { json: null });

    const { result } = renderMutation(() => useUpdateApiKeyScopes("c1"));
    await result.current.mutateAsync({ id: "key-9", scopes: ["bookings:read", "locations:read"] });

    expect(espiao.ultimoBody).toEqual({
      p_api_key_id: "key-9",
      p_scopes: ["bookings:read", "locations:read"],
    });
  });

  it("a lista vai como está: é substituição, não acréscimo", async () => {
    // A RPC troca o conjunto inteiro. Se a tela mandasse só o que mudou, tirar um
    // escopo da lista não tiraria nada, e a chave manteria a permissão que o parceiro
    // acabou de revogar.
    const espiao = rpc("operator_update_api_key_scopes", { json: null });

    const { result } = renderMutation(() => useUpdateApiKeyScopes("c1"));
    await result.current.mutateAsync({ id: "key-9", scopes: ["bookings:read"] });

    expect((espiao.ultimoBody as { p_scopes: string[] }).p_scopes).toEqual(["bookings:read"]);
  });

  it("lista vazia é pedido legítimo: revoga tudo sem apagar a chave", async () => {
    // Vazio é como o parceiro suspende uma integração sem perder o histórico. Um
    // guard truthy no caminho transformaria isso em "não mudou nada", e a chave
    // continuaria valendo.
    const espiao = rpc("operator_update_api_key_scopes", { json: null });

    const { result } = renderMutation(() => useUpdateApiKeyScopes("c1"));
    await result.current.mutateAsync({ id: "key-9", scopes: [] });

    expect((espiao.ultimoBody as { p_scopes: string[] }).p_scopes).toEqual([]);
  });

  it("escopo interno recusado pelo servidor sobe legível", async () => {
    // ADR-005: escopo só-interno (team:*, payouts:*) não pode ir para uma chave. Quem
    // recusa é a `api_assert_scopes`, e o parceiro precisa ler qual escopo foi barrado.
    falha(
      "rpc",
      "operator_update_api_key_scopes",
      400,
      "Escopo não disponível para chave de API: payouts:write",
    );

    const { result } = renderMutation(() => useUpdateApiKeyScopes("c1"));
    await expect(
      result.current.mutateAsync({ id: "key-9", scopes: ["payouts:write"] }),
    ).rejects.toThrow(/payouts:write/);
  });
});
