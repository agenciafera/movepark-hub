import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc, tabela } from "@/test/msw/supabase";
import { useSubmitReview } from "./api";
import { useSetReviewPublished } from "./managerApi";
import { useRespondReview } from "./operatorApi";

/**
 * Contrato de rede das avaliações. A nota entra na média da unidade, que aparece no
 * card da busca e no JSON-LD da página, então ela mexe em ranking e em SEO.
 *
 * As três mutations moram em arquivos diferentes de propósito (cliente, manager,
 * operator), porque cada uma é autorizada por um caminho: a `submit_review` é RPC
 * definer, a publicação é RLS de admin e a resposta é escopo de parceiro.
 */

describe("useSubmitReview", () => {
  it("manda a avaliação para a RPC", async () => {
    const espiao = rpc("submit_review", { json: "rev-1" });

    const { result } = renderMutation(() => useSubmitReview());
    await result.current.mutateAsync({
      p_booking_id: "bk-1",
      p_rating: 5,
      p_comment: "Tudo certo",
      p_cleanliness: 5,
      p_service: 5,
      p_value: 5,
      p_access: 4,
    });

    expect(espiao.ultimoBody).toMatchObject({ p_booking_id: "bk-1", p_rating: 5 });
  });

  it("avaliar duas vezes: a recusa da RPC chega legível", async () => {
    // Uma reserva, uma avaliação. Sem a mensagem, a pessoa acha que não enviou e
    // tenta de novo.
    falha("rpc", "submit_review", 400, "esta reserva já foi avaliada");

    const { result } = renderMutation(() => useSubmitReview());
    await expect(
      result.current.mutateAsync({
        p_booking_id: "bk-1",
        p_rating: 5,
        p_comment: null,
        p_cleanliness: null,
        p_service: null,
        p_value: null,
        p_access: null,
      }),
    ).rejects.toThrow(/já foi avaliada/);
  });
});

describe("useSetReviewPublished", () => {
  it("publica alterando só o campo de moderação", async () => {
    const patch = tabela("review", "patch", { json: [] });

    const { result } = renderMutation(() => useSetReviewPublished());
    await result.current.mutateAsync({ id: "rev-9", is_published: true });

    expect(patch.chamadas[0].url).toContain("id=eq.rev-9");
    expect(patch.ultimoBody).toEqual({ is_published: true });
  });

  it("despublicar manda false, e o false não se perde", async () => {
    // É a moderação: despublicar é como se tira do ar uma avaliação abusiva. Se o
    // campo sumisse, ela seguiria pública e contando na média.
    const patch = tabela("review", "patch", { json: [] });

    const { result } = renderMutation(() => useSetReviewPublished());
    await result.current.mutateAsync({ id: "rev-9", is_published: false });

    expect(patch.ultimoBody).toEqual({ is_published: false });
  });
});

describe("useRespondReview", () => {
  it("manda a avaliação e o texto da resposta", async () => {
    const espiao = rpc("operator_respond_review", { json: null });

    const { result } = renderMutation(() => useRespondReview("c1"));
    await result.current.mutateAsync({ reviewId: "rev-9", response: "Obrigado pelo retorno!" });

    expect(espiao.ultimoBody).toEqual({
      p_review_id: "rev-9",
      p_response: "Obrigado pelo retorno!",
    });
  });

  it("responder passa pela RPC, nunca por update direto na tabela", async () => {
    // A RPC é quem confere que a avaliação é de uma unidade da empresa. Um update
    // direto em `review` deixaria um parceiro responder pela unidade de outro.
    const viaRpc = rpc("operator_respond_review", { json: null });
    const viaTabela = tabela("review", "patch", { json: [] });

    const { result } = renderMutation(() => useRespondReview("c1"));
    await result.current.mutateAsync({ reviewId: "rev-9", response: "ok" });

    expect(viaRpc.chamadas).toHaveLength(1);
    expect(viaTabela.chamadas).toHaveLength(0);
  });
});
