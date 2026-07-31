import { describe, expect, it } from "vitest";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import { useCreateAddress, useDeleteAddress, useUpdateAddress } from "./api";

/** Contrato de rede do CRUD de endereços do cliente. */

describe("useCreateAddress", () => {
  it("insere o endereço com o payload recebido", async () => {
    const insert = tabela("address", "post", { json: [] });

    const { result } = renderMutation(() => useCreateAddress());
    await result.current.mutateAsync({ profile_id: "u1", street: "Rua A", city: "SP" } as never);

    expect(insert.ultimoBody).toMatchObject({ street: "Rua A", city: "SP" });
  });

  it("desmarca os outros antes de inserir, quando entra como padrão", async () => {
    const desmarca = tabela("address", "patch", { json: [] });
    const insert = tabela("address", "post", { json: [] });

    const { result } = renderMutation(() => useCreateAddress());
    await result.current.mutateAsync({ profile_id: "u1", street: "Rua A", is_default: true } as never);

    expect(desmarca.ultimoBody).toEqual({ is_default: false });
    expect(insert.chamadas).toHaveLength(1);
  });

  it("propaga o erro do insert", async () => {
    falha("tabela", "address", 400, "CEP inválido");

    const { result } = renderMutation(() => useCreateAddress());
    await expect(
      result.current.mutateAsync({ profile_id: "u1", street: "Rua A" } as never),
    ).rejects.toThrow();
  });
});

describe("useUpdateAddress", () => {
  it("aplica o patch no endereço certo", async () => {
    const patch = tabela("address", "patch", { json: [] });

    const { result } = renderMutation(() => useUpdateAddress());
    await result.current.mutateAsync({ id: "a9", profile_id: "u1", patch: { city: "RJ" } } as never);

    const ultima = patch.chamadas[patch.chamadas.length - 1];
    expect(ultima.url).toContain("id=eq.a9");
    expect(ultima.body).toMatchObject({ city: "RJ" });
  });
});

describe("useDeleteAddress", () => {
  it("apaga a linha de verdade (hard delete), diferente de veículo e cartão", async () => {
    // Registra o comportamento REAL, que diverge do resto do app: `vehicle` e
    // `payment_method` fazem soft delete com `deleted_at`, e o CLAUDE.md põe
    // soft delete como regra. Endereço apaga.
    //
    // Não está errado por si: endereço não é referenciado por booking, então
    // não há FK para proteger. Mas é uma divergência de padrão, e este teste
    // existe para que ela seja uma decisão visível em vez de um descuido. Se um
    // dia endereço passar a ser referenciado, este teste é onde a mudança bate.
    const hard = tabela("address", "delete", { json: [] });
    const soft = tabela("address", "patch", { json: [] });

    const { result } = renderMutation(() => useDeleteAddress());
    await result.current.mutateAsync("a9");

    expect(hard.chamadas).toHaveLength(1);
    expect(hard.chamadas[0].url).toContain("id=eq.a9");
    expect(soft.chamadas).toHaveLength(0);
  });
});
