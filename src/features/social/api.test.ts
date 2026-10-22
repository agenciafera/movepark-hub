import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { edge, falha, renderMutation, rpc } from "@/test/msw/supabase";
import {
  mensagemDaEdge,
  useApproveSocialPost,
  usePublishSocialPostNow,
  useRejectSocialPost,
  useRescheduleSocialPost,
  useSetSocialPlacements,
  useUpdateSocialCaption,
} from "./api";

/** Erro como o `functions.invoke` entrega quando a Edge responde não-2xx: genérico, com o `Response` no `context`. */
function erroDaEdge(corpo: string, status: number): Error {
  return Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    context: new Response(corpo, { status, headers: { "Content-Type": "application/json" } }),
  });
}

describe("mensagemDaEdge", () => {
  it("junta os erros de validação do corpo `erros` numa frase só", async () => {
    const erro = erroDaEdge(
      JSON.stringify({
        ok: false,
        erros: ["A legenda passa de 2.200 caracteres.", "Falta a data de referência do preço."],
      }),
      422,
    );
    await expect(mensagemDaEdge(erro)).resolves.toBe(
      "A legenda passa de 2.200 caracteres. Falta a data de referência do preço.",
    );
  });

  it("traduz o 401 real da Edge (`unauthorized`) para pt-BR", async () => {
    const erro = erroDaEdge(JSON.stringify({ error: "unauthorized" }), 401);
    await expect(mensagemDaEdge(erro)).resolves.toBe(
      "Sua sessão expirou. Entre de novo para continuar.",
    );
  });

  it("traduz o 403 real da Edge (`forbidden`) para pt-BR", async () => {
    const erro = erroDaEdge(JSON.stringify({ error: "forbidden" }), 403);
    await expect(mensagemDaEdge(erro)).resolves.toBe(
      "Só a equipe da Movepark pode corrigir a legenda.",
    );
  });

  it("passa o texto pt-BR do corpo `error` quando não é código de máquina (404)", async () => {
    const erro = erroDaEdge(JSON.stringify({ error: "Post não encontrado." }), 404);
    await expect(mensagemDaEdge(erro)).resolves.toBe("Post não encontrado.");
  });

  it("lê o `erro` da social-dispatch quando a publicação falha (502)", async () => {
    const erro = erroDaEdge(
      JSON.stringify({
        ok: false,
        acao: "falhou",
        post: "p1",
        erro: "Falhou ao enviar a imagem à Meta.",
      }),
      502,
    );
    await expect(mensagemDaEdge(erro)).resolves.toBe("Falhou ao enviar a imagem à Meta.");
  });

  it("cai na mensagem do erro quando não há Response no contexto", async () => {
    await expect(mensagemDaEdge(new Error("Falha de rede"))).resolves.toBe("Falha de rede");
  });

  it("cai na mensagem do erro quando o corpo não é JSON", async () => {
    const erro = erroDaEdge("<html>Bad Gateway</html>", 502);
    await expect(mensagemDaEdge(erro)).resolves.toBe(
      "Edge Function returned a non-2xx status code",
    );
  });
});

describe("useUpdateSocialCaption", () => {
  it("manda a legenda para a Edge social-draft e devolve a conferência", async () => {
    const espiao = edge("social-draft", {
      json: { ok: true, validation: { blockers: [], warnings: ["Gancho com 130 caracteres."] } },
    });
    const { result } = renderMutation(() => useUpdateSocialCaption());
    const validation = await result.current.mutateAsync({
      id: "post-1",
      caption: "Nova legenda",
      expected_updated_at: "2026-10-21T20:11:03.123456+00:00",
    });
    // A versão aberta vai inteira e sem passar por Date: a Edge compara a string com o banco.
    expect(espiao.ultimoBody).toEqual({
      action: "update_caption",
      id: "post-1",
      caption: "Nova legenda",
      expected_updated_at: "2026-10-21T20:11:03.123456+00:00",
    });
    expect(validation).toEqual({ blockers: [], warnings: ["Gancho com 130 caracteres."] });
  });

  it("mostra na tela o motivo que a Edge devolveu, não a frase genérica do Supabase", async () => {
    edge("social-draft", {
      status: 422,
      json: { ok: false, erros: ["Falta a data de referência do preço."] },
    });
    const { result } = renderMutation(() => useUpdateSocialCaption());
    await expect(
      result.current.mutateAsync({
        id: "post-1",
        caption: "R$ 90",
        expected_updated_at: "2026-10-21T20:11:03.123456+00:00",
      }),
    ).rejects.toThrow("Falta a data de referência do preço.");
  });

  it("no 409 de versão velha, mostra o texto da Edge e recarrega a fila para ver a versão nova", async () => {
    edge("social-draft", {
      status: 409,
      json: {
        ok: false,
        erros: [
          "O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova.",
        ],
      },
    });
    const { result, qc } = renderMutation(() => useUpdateSocialCaption());
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    await expect(
      result.current.mutateAsync({
        id: "post-1",
        caption: "Legenda",
        expected_updated_at: "2026-10-20T10:00:00+00:00",
      }),
    ).rejects.toThrow("O post mudou desde que você abriu.");
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ["social"] }));
  });
});

describe("decisões da fila pelas RPCs", () => {
  it("aprova chamando social_post_approve com o id e a versão que a pessoa viu", async () => {
    const espiao = rpc("social_post_approve");
    const { result } = renderMutation(() => useApproveSocialPost());
    await result.current.mutateAsync({
      p_id: "post-1",
      p_expected_updated_at: "2026-10-21T20:11:03.123456+00:00",
    });
    expect(espiao.ultimoBody).toEqual({
      p_id: "post-1",
      p_expected_updated_at: "2026-10-21T20:11:03.123456+00:00",
    });
  });

  it("aprovação recusada (versão velha) devolve o texto do servidor e recarrega a fila", async () => {
    falha(
      "rpc",
      "social_post_approve",
      400,
      "O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova.",
    );
    const { result, qc } = renderMutation(() => useApproveSocialPost());
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    await expect(
      result.current.mutateAsync({
        p_id: "post-1",
        p_expected_updated_at: "2026-10-20T10:00:00+00:00",
      }),
    ).rejects.toMatchObject({
      message:
        "O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova.",
    });
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ["social"] }));
  });

  it("recusa chamando social_post_reject com o motivo", async () => {
    const espiao = rpc("social_post_reject");
    const { result } = renderMutation(() => useRejectSocialPost());
    await result.current.mutateAsync({ p_id: "post-1", p_reason: "Foto errada" });
    expect(espiao.ultimoBody).toEqual({ p_id: "post-1", p_reason: "Foto errada" });
  });

  it("muda onde o post sai chamando social_post_set_placements com a versão aberta", async () => {
    const espiao = rpc("social_post_set_placements");
    const { result } = renderMutation(() => useSetSocialPlacements());
    await result.current.mutateAsync({
      p_id: "post-1",
      p_placements: ["feed", "story"],
      p_expected_updated_at: "2026-10-20T10:00:00+00:00",
    });
    expect(espiao.ultimoBody).toEqual({
      p_id: "post-1",
      p_placements: ["feed", "story"],
      p_expected_updated_at: "2026-10-20T10:00:00+00:00",
    });
  });

  it("reagenda chamando social_post_reschedule com a nova data em UTC", async () => {
    const espiao = rpc("social_post_reschedule");
    const { result } = renderMutation(() => useRescheduleSocialPost());
    await result.current.mutateAsync({ p_id: "post-1", p_at: "2026-10-28T15:00:00.000Z" });
    expect(espiao.ultimoBody).toEqual({ p_id: "post-1", p_at: "2026-10-28T15:00:00.000Z" });
  });
});

describe("usePublishSocialPostNow", () => {
  const VERSAO = "2026-10-21T20:11:03.123456+00:00";

  it("pede pela RPC com a versão aberta e depois chama a social-dispatch só com o post", async () => {
    const pedido = rpc("social_post_publish_now");
    const publicacao = edge("social-dispatch", {
      json: {
        ok: true,
        acao: "publicado",
        post: "post-1",
        permalink: "https://www.instagram.com/p/ABC/",
      },
    });
    const { result, qc } = renderMutation(() => usePublishSocialPostNow());
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    const r = await result.current.mutateAsync({ p_id: "post-1", p_expected_updated_at: VERSAO });
    expect(pedido.ultimoBody).toEqual({ p_id: "post-1", p_expected_updated_at: VERSAO });
    expect(publicacao.ultimoBody).toEqual({ post_id: "post-1" });
    expect(r).toEqual({ acao: "publicado", permalink: "https://www.instagram.com/p/ABC/", stories: null });
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ["social"] }));
  });

  it("devolve outra_rodada e reconciliado sem tratar como erro", async () => {
    rpc("social_post_publish_now");
    edge("social-dispatch", { json: { ok: true, acao: "outra_rodada", post: "post-1" } });
    const { result } = renderMutation(() => usePublishSocialPostNow());
    await expect(
      result.current.mutateAsync({ p_id: "post-1", p_expected_updated_at: VERSAO }),
    ).resolves.toEqual({ acao: "outra_rodada", permalink: null, stories: null });

    edge("social-dispatch", { json: { ok: true, acao: "reconciliado", post: "post-1" } });
    await expect(
      result.current.mutateAsync({ p_id: "post-1", p_expected_updated_at: VERSAO }),
    ).resolves.toEqual({ acao: "reconciliado", permalink: null, stories: null });
  });

  it("post já publicado no feed: devolve stories com quantos saíram e quantos faltam", async () => {
    rpc("social_post_publish_now");
    edge("social-dispatch", {
      json: { ok: true, acao: "stories", post: "post-1", stories: { publicados: 4, faltam: 2 } },
    });
    const { result } = renderMutation(() => usePublishSocialPostNow());
    await expect(
      result.current.mutateAsync({ p_id: "post-1", p_expected_updated_at: VERSAO }),
    ).resolves.toEqual({ acao: "stories", permalink: null, stories: { publicados: 4, faltam: 2 } });
  });

  it("RPC recusada: mostra o texto do servidor, não chama a Edge e recarrega a fila", async () => {
    falha(
      "rpc",
      "social_post_publish_now",
      400,
      "O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova.",
    );
    const publicacao = edge("social-dispatch", { json: { ok: true, acao: "publicado" } });
    const { result, qc } = renderMutation(() => usePublishSocialPostNow());
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    await expect(
      result.current.mutateAsync({ p_id: "post-1", p_expected_updated_at: VERSAO }),
    ).rejects.toMatchObject({
      message:
        "O post mudou desde que você abriu. Feche e abra de novo para conferir a versão nova.",
    });
    expect(publicacao.chamadas).toHaveLength(0);
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ["social"] }));
  });

  it("a Meta recusou (502 falhou): o erro traz o texto em português e a fila recarrega", async () => {
    rpc("social_post_publish_now");
    edge("social-dispatch", {
      status: 502,
      json: {
        ok: false,
        acao: "falhou",
        post: "post-1",
        erro: "Falhou ao publicar na Meta. Confira no Instagram antes de reagendar.",
      },
    });
    const { result, qc } = renderMutation(() => usePublishSocialPostNow());
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    await expect(
      result.current.mutateAsync({ p_id: "post-1", p_expected_updated_at: VERSAO }),
    ).rejects.toThrow("Falhou ao publicar na Meta. Confira no Instagram antes de reagendar.");
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ["social"] }));
  });

  it("409 da Edge (o post mudou entre a RPC e a chamada) chega como o texto da Edge", async () => {
    rpc("social_post_publish_now");
    edge("social-dispatch", {
      status: 409,
      json: { ok: false, post: "post-1", error: "Este post já está sendo publicado." },
    });
    const { result } = renderMutation(() => usePublishSocialPostNow());
    await expect(
      result.current.mutateAsync({ p_id: "post-1", p_expected_updated_at: VERSAO }),
    ).rejects.toThrow("Este post já está sendo publicado.");
  });
});
