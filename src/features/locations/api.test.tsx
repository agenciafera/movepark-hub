import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import { useCreateLocation, useSetCheckoutMode, useSetGo2Park, useUpdateLocation } from "./api";

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
 * Contrato do cliente para a Go2Park (transfer com rastreio ao vivo). Quem decide é o banco
 * (trigger location_go2park_guard, exercitado em supabase/tests/location_go2park.test.sql); aqui
 * o que importa é o patch sair enxuto e a recusa chegar inteira na tela.
 */
describe("useSetGo2Park", () => {
  it("manda só go2park_enabled no patch da unidade", async () => {
    const patch = tabela("location", "patch", { json: [{ id: "loc-1", go2park_enabled: true }] });
    const { result } = renderMutation(() => useSetGo2Park());

    await result.current.mutateAsync({ id: "loc-1", enabled: true });

    expect(patch.chamadas.length).toBe(1);
    expect(patch.ultimoBody).toEqual({ go2park_enabled: true });
    expect(patch.chamadas[0].url).toContain("id=eq.loc-1");
  });

  it("desliga quando o contrato acaba", async () => {
    const patch = tabela("location", "patch", { json: [{ id: "loc-1", go2park_enabled: false }] });
    const { result } = renderMutation(() => useSetGo2Park());

    await result.current.mutateAsync({ id: "loc-1", enabled: false });

    expect(patch.ultimoBody).toEqual({ go2park_enabled: false });
  });

  it("grava só o número quando é ele que muda", async () => {
    const patch = tabela("location", "patch", {
      json: [{ id: "loc-1", go2park_whatsapp: "+5519988013420" }],
    });
    const { result } = renderMutation(() => useSetGo2Park());

    await result.current.mutateAsync({ id: "loc-1", whatsapp: "+5519988013420" });

    // Sem `go2park_enabled` no corpo: o interruptor e o número são salvos em momentos diferentes,
    // e mandar os dois faria um sobrescrever o outro com valor de tela desatualizado.
    expect(patch.ultimoBody).toEqual({ go2park_whatsapp: "+5519988013420" });
  });

  it("limpa o número com null quando a unidade perde a van", async () => {
    const patch = tabela("location", "patch", { json: [{ id: "loc-1", go2park_whatsapp: null }] });
    const { result } = renderMutation(() => useSetGo2Park());

    await result.current.mutateAsync({ id: "loc-1", whatsapp: null });

    expect(patch.ultimoBody).toEqual({ go2park_whatsapp: null });
  });

  it("propaga a recusa do banco em vez de engolir", async () => {
    falha("tabela", "location", 403, "go2park_enabled só pode ser alterado por hub_admin");
    const { result } = renderMutation(() => useSetGo2Park());

    await expect(result.current.mutateAsync({ id: "loc-1", enabled: true })).rejects.toThrow(
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
