import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { edge, falha, renderMutation, tabela } from "@/test/msw/supabase";
import { useConfirmarAcao, useEnviarAoAssistente } from "./api";
import { useArquivarArtigo, useLiberarEmpresa, useResolverLacuna, useSalvarArtigo } from "./managerApi";

// Contrato de rede da Mia para operadores (docs/specs/assistente-do-operador.md).

beforeEach(() => {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: { access_token: "jwt" } as never },
    error: null,
  } as never);
  vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
    data: { user: { id: "admin-1" } as never },
    error: null,
  } as never);
});

describe("bolinha: Edge operator-assistant", () => {
  it("envia só mensagem, empresa, página e código; o contexto do agente é montado no servidor", async () => {
    const chamada = edge("operator-assistant", {
      json: { reply: "ok", used_tools: [], actions: [], conversation_id: "c1" },
    });
    const { result } = renderMutation(() => useEnviarAoAssistente());
    await result.current.mutateAsync({
      companyId: "empresa-1",
      mensagem: "posso cancelar?",
      pagina: "/operator/bookings/MP-ABC123",
      bookingCode: "MP-ABC123",
    });
    expect(chamada.ultimoBody).toEqual({
      acao: "enviar",
      company_id: "empresa-1",
      mensagem: "posso cancelar?",
      pagina: "/operator/bookings/MP-ABC123",
      booking_code: "MP-ABC123",
    });
  });

  it("propaga a mensagem da Edge (teto de uso, proposta vencida)", async () => {
    falha("edge", "operator-assistant", 409, "A proposta venceu (10 minutos). Peça de novo à Mia.");
    const { result } = renderMutation(() => useConfirmarAcao());
    await expect(result.current.mutateAsync("a1")).rejects.toThrow(/venceu/);
  });
});

describe("Manager: lacunas e base do operador", () => {
  it("resolver lacuna grava status, nota e quem resolveu", async () => {
    const chamada = tabela("operator_assistant_gap", "patch", { status: 204 });
    const { result } = renderMutation(() => useResolverLacuna());
    await result.current.mutateAsync({ id: "g1", status: "resolved", nota: "Base atualizada.", articleId: null });
    expect(chamada.ultimoBody).toMatchObject({ status: "resolved", resolution_note: "Base atualizada.", resolved_by: "admin-1" });
    expect(chamada.chamadas[0].url).toContain("id=eq.g1");
  });

  it("salvar artigo novo insere; com id, atualiza o mesmo", async () => {
    const insert = tabela("operator_playbook_article", "post", { json: { id: "art-1" } });
    const { result } = renderMutation(() => useSalvarArtigo());
    const id = await result.current.mutateAsync({
      slug: "quando-cai-o-estorno",
      title: "Quando cai o estorno",
      category: "Estorno",
      body_md: "O estorno volta na mesma forma de pagamento.",
      is_published: true,
    });
    expect(id).toBe("art-1");
    expect(insert.ultimoBody).toMatchObject({ slug: "quando-cai-o-estorno", updated_by: "admin-1" });

    const update = tabela("operator_playbook_article", "patch", { status: 204 });
    const { result: r2 } = renderMutation(() => useSalvarArtigo());
    await r2.current.mutateAsync({
      id: "art-1",
      slug: "quando-cai-o-estorno",
      title: "Quando cai o estorno",
      category: "Estorno",
      body_md: "Texto novo e maior do que o anterior.",
      is_published: false,
    });
    expect(update.ultimoBody).toMatchObject({ is_published: false });
    expect(update.chamadas[0].url).toContain("id=eq.art-1");
  });

  it("arquivar é soft delete e despublica (a Mia para de usar)", async () => {
    const chamada = tabela("operator_playbook_article", "patch", { status: 204 });
    const { result } = renderMutation(() => useArquivarArtigo());
    await result.current.mutateAsync("art-1");
    expect(chamada.ultimoBody).toMatchObject({ is_published: false });
    expect((chamada.ultimoBody as { deleted_at: string }).deleted_at).toBeTruthy();
  });
});

describe("Manager: liberação por empresa", () => {
  it("liberar insere a empresa na lista; desligar apaga só ela", async () => {
    const insert = tabela("operator_assistant_company", "post", { status: 201 });
    const { result } = renderMutation(() => useLiberarEmpresa());
    await result.current.mutateAsync({ companyId: "empresa-1", liberar: true });
    expect(insert.ultimoBody).toEqual({ company_id: "empresa-1" });

    const apaga = tabela("operator_assistant_company", "delete", { status: 204 });
    const { result: r2 } = renderMutation(() => useLiberarEmpresa());
    await r2.current.mutateAsync({ companyId: "empresa-1", liberar: false });
    expect(apaga.chamadas[0].url).toContain("company_id=eq.empresa-1");
  });

  it("propaga a recusa da RLS (quem não é hub_admin não liga)", async () => {
    falha("tabela", "operator_assistant_company", 403, "new row violates row-level security policy");
    const { result } = renderMutation(() => useLiberarEmpresa());
    await expect(result.current.mutateAsync({ companyId: "empresa-1", liberar: true })).rejects.toThrow(/row-level/);
  });
});
