import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useCreatePlatformKey, useRevokePlatformKey } from "./api";

/**
 * Contrato de rede da chave de plataforma.
 *
 * Esta é a credencial que abre a superfície interna da Movepark, então o teste
 * cobre as duas pontas do cliente: chamar a RPC certa com o payload certo, e
 * propagar a recusa em vez de engolir. Quem barra de fato é o `is_hub_admin()`
 * dentro da RPC, coberto no pgTAP.
 */

describe("useCreatePlatformKey", () => {
  it("emite pela RPC de plataforma e devolve o segredo", async () => {
    const chamada = rpc("hub_create_platform_api_key", {
      json: { id: "k-1", key: "mp_test_segredo", key_prefix: "mp_test_segred" },
    });
    const { result } = renderMutation(() => useCreatePlatformKey());

    const r = await result.current.mutateAsync({
      name: "Bot de conteúdo",
      environment: "test",
      scopes: ["blog:write"],
    });

    // O segredo aparece uma vez só: a tela mostra na hora ou ele se perde.
    expect(r.key).toBe("mp_test_segredo");
    expect(chamada.ultimoBody).toEqual({
      p_name: "Bot de conteúdo",
      p_environment: "test",
      p_scopes: ["blog:write"],
    });
  });

  it("propaga a recusa de quem não é hub_admin", async () => {
    falha("rpc", "hub_create_platform_api_key", 403, "Só a equipe Movepark emite chave de plataforma.");
    const { result } = renderMutation(() => useCreatePlatformKey());

    await expect(
      result.current.mutateAsync({ name: "x", environment: "test", scopes: ["blog:write"] }),
    ).rejects.toThrow("Só a equipe Movepark emite chave de plataforma.");
  });
});

describe("useRevokePlatformKey", () => {
  it("revoga pelo id", async () => {
    const chamada = rpc("hub_revoke_platform_api_key", { json: null });
    const { result } = renderMutation(() => useRevokePlatformKey());

    await result.current.mutateAsync("k-9");

    expect(chamada.ultimoBody).toEqual({ p_id: "k-9" });
  });

  it("propaga o erro do servidor", async () => {
    falha("rpc", "hub_revoke_platform_api_key", 403, "Acesso restrito à equipe Movepark.");
    const { result } = renderMutation(() => useRevokePlatformKey());

    await expect(result.current.mutateAsync("k-9")).rejects.toThrow("Acesso restrito");
  });
});
