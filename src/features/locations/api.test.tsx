import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import { useCreateLocation, useSetCheckoutMode, useUpdateLocation } from "./api";

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

/**
 * CRUD da unidade. Ela é o que aparece na busca e o que tem endereço, telefone e
 * política de reserva na página pública, então o patch daqui vai direto para o que o
 * cliente lê antes de decidir.
 */
describe("useCreateLocation", () => {
  it("insere a unidade e devolve a linha criada", async () => {
    // O retorno importa: a tela encadeia o cadastro dos tipos de vaga com o id.
    tabela("location", "post", { json: { id: "l-novo", name: "Unidade QA" } });

    const { result } = renderMutation(() => useCreateLocation());
    const criada = await result.current.mutateAsync({
      company_id: "c1",
      name: "Unidade QA",
      slug: "unidade-qa",
    });

    expect((criada as { id: string }).id).toBe("l-novo");
  });

  it("slug duplicado sobe com a mensagem do servidor", async () => {
    // O slug entra na url pública `/p/<empresa>/<unidade>/<tipo>`, então é único.
    falha("tabela", "location", 409, "slug já existe nesta empresa");

    const { result } = renderMutation(() => useCreateLocation());
    await expect(
      result.current.mutateAsync({ company_id: "c1", name: "X", slug: "unidade-qa" }),
    ).rejects.toThrow();
  });
});

describe("useUpdateLocation", () => {
  it("aplica o patch na unidade certa, e só o que mudou", async () => {
    const patch = tabela("location", "patch", { json: { id: "l-9" } });

    const { result } = renderMutation(() => useUpdateLocation());
    await result.current.mutateAsync({ id: "l-9", patch: { phone: "+551140028922" } });

    expect(patch.chamadas[0].url).toContain("id=eq.l-9");
    expect(patch.ultimoBody).toEqual({ phone: "+551140028922" });
  });

  it("tirar da busca manda false, e o false não se perde", async () => {
    // `is_listed` é o que tira a unidade da vitrine. Se o campo sumisse do patch, ela
    // continuaria vendendo enquanto o painel mostra fora do ar.
    const patch = tabela("location", "patch", { json: { id: "l-9" } });

    const { result } = renderMutation(() => useUpdateLocation());
    await result.current.mutateAsync({ id: "l-9", patch: { is_listed: false } });

    expect(patch.ultimoBody).toEqual({ is_listed: false });
  });

  it("devolve a unidade atualizada, para a tela não adivinhar", async () => {
    tabela("location", "patch", { json: { id: "l-9", phone: "+551140028922" } });

    const { result } = renderMutation(() => useUpdateLocation());
    const atualizada = await result.current.mutateAsync({
      id: "l-9",
      patch: { phone: "+551140028922" },
    });

    expect((atualizada as { phone: string }).phone).toBe("+551140028922");
  });
});
