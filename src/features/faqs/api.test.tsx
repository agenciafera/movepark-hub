import { describe, expect, it } from "vitest";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import {
  useCreateFaq,
  useDeleteFaq,
  useDeleteFaqCategory,
  useUpdateFaq,
  useUpsertFaqCategory,
} from "./api";

/**
 * Contrato de rede da FAQ. A FAQ é resolvida por camadas (global, destino, unidade,
 * ADR-002) e a mesma resposta aparece na tela e no JSON-LD da página. Escrever na
 * camada errada não quebra nada: publica a resposta do aeroporto na unidade de outro.
 */

describe("useUpsertFaqCategory", () => {
  it("faz upsert com conflito no id", async () => {
    // `onConflict: id` é o que permite a mesma tela criar e editar. Sem ele, salvar
    // uma categoria existente viraria violação de chave em vez de edição.
    const up = tabela("faq_category", "post", { json: [] });

    const { result } = renderMutation(() => useUpsertFaqCategory());
    await result.current.mutateAsync({ id: "cat-1", label: "Pagamento", slug: "pagamento", sort_order: 1 });

    expect(up.ultimoBody).toMatchObject({ id: "cat-1", label: "Pagamento", slug: "pagamento" });
    expect(up.chamadas[0].url).toContain("faq_category");
  });
});

describe("useDeleteFaqCategory", () => {
  it("apaga de verdade, porque a tabela não tem deleted_at", async () => {
    // A regra do projeto é soft delete, e aqui a exceção é do SCHEMA: `faq_category`
    // não tem a coluna. Este teste existe para o dia em que ela ganhar: aí o delete
    // duro passa a ser bug, e é este arquivo que denuncia.
    const del = tabela("faq_category", "delete", { json: [] });

    const { result } = renderMutation(() => useDeleteFaqCategory());
    await result.current.mutateAsync("cat-9");

    expect(del.chamadas[0].url).toContain("id=eq.cat-9");
  });
});

describe("useCreateFaq", () => {
  it("insere a pergunta com o escopo que veio no payload", async () => {
    // O escopo é o que decide em qual camada a resposta aparece. Trocar `location`
    // por `global` publicaria a resposta de uma unidade em todas as páginas.
    const ins = tabela("faq", "post", { json: { id: "faq-1", question: "Como cancelo?" } });

    const { result } = renderMutation(() => useCreateFaq());
    await result.current.mutateAsync({
      scope: "location",
      location_id: "l1",
      question: "Como cancelo?",
      answer: "Pelo app, até 24h antes.",
    });

    expect(ins.ultimoBody).toMatchObject({
      scope: "location",
      location_id: "l1",
      question: "Como cancelo?",
    });
  });
});

describe("useUpdateFaq", () => {
  it("aplica o patch na pergunta certa", async () => {
    const patch = tabela("faq", "patch", { json: { id: "faq-9" } });

    const { result } = renderMutation(() => useUpdateFaq());
    await result.current.mutateAsync({ id: "faq-9", patch: { is_published: false } });

    expect(patch.chamadas[0].url).toContain("id=eq.faq-9");
    expect(patch.ultimoBody).toEqual({ is_published: false });
  });

  it("despublicar manda false, e o false não se perde", async () => {
    // `is_published` é a moderação da FAQ. Se o campo sumisse do patch, a resposta
    // continuaria pública enquanto o admin vê despublicada.
    const patch = tabela("faq", "patch", { json: { id: "faq-9" } });

    const { result } = renderMutation(() => useUpdateFaq());
    await result.current.mutateAsync({ id: "faq-9", patch: { is_published: false } });

    expect(patch.ultimoBody).toHaveProperty("is_published", false);
  });
});

describe("useDeleteFaq", () => {
  it("faz soft delete: marca deleted_at, não apaga a linha", async () => {
    // Aqui a tabela TEM deleted_at, então vale a regra do projeto. Apagar de verdade
    // sumiria com a resposta do histórico e do JSON-LD já indexado.
    const patch = tabela("faq", "patch", { json: [] });
    const hard = tabela("faq", "delete", { json: [] });

    const { result } = renderMutation(() => useDeleteFaq());
    await result.current.mutateAsync("faq-9");

    expect((patch.ultimoBody as { deleted_at: string }).deleted_at).toBeTruthy();
    expect(patch.chamadas[0].url).toContain("id=eq.faq-9");
    expect(hard.chamadas).toHaveLength(0);
  });

  it("propaga a recusa do servidor", async () => {
    falha("tabela", "faq", 403, "sem permissão");

    const { result } = renderMutation(() => useDeleteFaq());
    await expect(result.current.mutateAsync("faq-9")).rejects.toThrow();
  });
});
