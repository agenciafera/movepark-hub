import { describe, expect, it } from "vitest";
import { edge, renderMutation, rpc } from "@/test/msw/supabase";
import {
  mensagemDaEdge,
  useApproveSocialPost,
  useRejectSocialPost,
  useRescheduleSocialPost,
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
    const validation = await result.current.mutateAsync({ id: "post-1", caption: "Nova legenda" });
    expect(espiao.ultimoBody).toEqual({
      action: "update_caption",
      id: "post-1",
      caption: "Nova legenda",
    });
    expect(validation).toEqual({ blockers: [], warnings: ["Gancho com 130 caracteres."] });
  });

  it("mostra na tela o motivo que a Edge devolveu, não a frase genérica do Supabase", async () => {
    edge("social-draft", {
      status: 422,
      json: { ok: false, erros: ["Falta a data de referência do preço."] },
    });
    const { result } = renderMutation(() => useUpdateSocialCaption());
    await expect(result.current.mutateAsync({ id: "post-1", caption: "R$ 90" })).rejects.toThrow(
      "Falta a data de referência do preço.",
    );
  });
});

describe("decisões da fila pelas RPCs", () => {
  it("aprova chamando social_post_approve com o id", async () => {
    const espiao = rpc("social_post_approve");
    const { result } = renderMutation(() => useApproveSocialPost());
    await result.current.mutateAsync({ p_id: "post-1" });
    expect(espiao.ultimoBody).toEqual({ p_id: "post-1" });
  });

  it("recusa chamando social_post_reject com o motivo", async () => {
    const espiao = rpc("social_post_reject");
    const { result } = renderMutation(() => useRejectSocialPost());
    await result.current.mutateAsync({ p_id: "post-1", p_reason: "Foto errada" });
    expect(espiao.ultimoBody).toEqual({ p_id: "post-1", p_reason: "Foto errada" });
  });

  it("reagenda chamando social_post_reschedule com a nova data em UTC", async () => {
    const espiao = rpc("social_post_reschedule");
    const { result } = renderMutation(() => useRescheduleSocialPost());
    await result.current.mutateAsync({ p_id: "post-1", p_at: "2026-10-28T15:00:00.000Z" });
    expect(espiao.ultimoBody).toEqual({ p_id: "post-1", p_at: "2026-10-28T15:00:00.000Z" });
  });
});
