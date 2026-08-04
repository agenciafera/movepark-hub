import { describe, expect, it } from "vitest";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import { useUpdateAppSettings } from "./api";

/**
 * Contrato de rede das configurações globais (`app_setting`). É a tabela que guarda,
 * entre outras coisas, a política de parcelamento que o checkout lê e o interruptor do
 * assistente. Uma chave gravada errada muda o comportamento do produto inteiro sem
 * deploy, que é justamente a graça e o risco.
 */

describe("useUpdateAppSettings", () => {
  it("transforma o objeto em linhas de chave e valor", async () => {
    const up = tabela("app_setting", "post", { json: [] });

    const { result } = renderMutation(() => useUpdateAppSettings());
    await result.current.mutateAsync({ chatbot_enabled: "true", support_phone: "+551140028922" });

    expect(up.ultimoBody).toEqual([
      { key: "chatbot_enabled", value: "true" },
      { key: "support_phone", value: "+551140028922" },
    ]);
  });

  it("grava só as chaves enviadas, sem tocar nas outras", async () => {
    // O upsert é por chave. Se a tela mandasse o mapa inteiro sempre, editar uma
    // configuração reescreveria todas as outras com o que estava carregado na tela.
    const up = tabela("app_setting", "post", { json: [] });

    const { result } = renderMutation(() => useUpdateAppSettings());
    await result.current.mutateAsync({ chatbot_enabled: "false" });

    expect(up.ultimoBody).toEqual([{ key: "chatbot_enabled", value: "false" }]);
  });

  it("string vazia é valor legítimo e chega ao servidor", async () => {
    // Vazio é como se limpa uma configuração opcional. Um filtro truthy no caminho
    // manteria o valor antigo enquanto a tela mostra o campo em branco.
    const up = tabela("app_setting", "post", { json: [] });

    const { result } = renderMutation(() => useUpdateAppSettings());
    await result.current.mutateAsync({ support_phone: "" });

    expect(up.ultimoBody).toEqual([{ key: "support_phone", value: "" }]);
  });

  it("propaga a recusa do servidor", async () => {
    falha("tabela", "app_setting", 403, "apenas hub_admin");

    const { result } = renderMutation(() => useUpdateAppSettings());
    await expect(result.current.mutateAsync({ chatbot_enabled: "true" })).rejects.toThrow();
  });
});
