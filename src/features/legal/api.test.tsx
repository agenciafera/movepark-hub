import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { edge, falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useAcceptTerms, usePublishLegalDocument } from "./api";

/**
 * Contrato de rede dos documentos legais. Publicar cria uma VERSÃO nova, e é a versão
 * que fica registrada no aceite de cada reserva. Sobrescrever em vez de versionar
 * apagaria a prova de qual texto a pessoa aceitou.
 */

function comSessao(token: string | null) {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: token ? ({ access_token: token } as never) : null },
    error: null,
  } as never);
}

describe("usePublishLegalDocument", () => {
  it("publica pela RPC, com slug e conteúdo", async () => {
    const espiao = rpc("publish_legal_document", { json: { version: 3 } });

    const { result } = renderMutation(() => usePublishLegalDocument());
    await result.current.mutateAsync({ slug: "termos", content: "# Termos\n\nTexto." });

    expect(espiao.ultimoBody).toEqual({
      p_slug: "termos",
      p_content: "# Termos\n\nTexto.",
    });
  });

  it("publica pela RPC, nunca por update direto na tabela", async () => {
    // A RPC é quem incrementa a versão. Um update direto trocaria o texto mantendo o
    // número, e os aceites antigos passariam a apontar para um conteúdo que ninguém viu.
    const viaRpc = rpc("publish_legal_document", { json: { version: 3 } });

    const { result } = renderMutation(() => usePublishLegalDocument());
    await result.current.mutateAsync({ slug: "termos", content: "x" });

    expect(viaRpc.chamadas).toHaveLength(1);
  });

  it("propaga a recusa do servidor", async () => {
    falha("rpc", "publish_legal_document", 403, "apenas hub_admin");

    const { result } = renderMutation(() => usePublishLegalDocument());
    await expect(
      result.current.mutateAsync({ slug: "termos", content: "x" }),
    ).rejects.toThrow();
  });
});

describe("useAcceptTerms", () => {
  it("registra o aceite pelo código da reserva", async () => {
    comSessao("token-de-teste");
    const espiao = edge("accept-terms", { json: { ok: true, version: 3 } });

    const { result } = renderMutation(() => useAcceptTerms());
    const r = await result.current.mutateAsync({ booking_code: "MP7K2X" });

    expect(espiao.ultimoBody).toEqual({ booking_code: "MP7K2X" });
    expect(r.version).toBe(3);
  });

  it("a versão aceita vem do servidor, não da tela", async () => {
    // Quem decide qual versão está valendo é o servidor, no instante do aceite. Se a
    // tela mandasse a versão que carregou, um aceite feito com a aba aberta há uma
    // hora registraria um texto que já foi substituído.
    comSessao("token-de-teste");
    const espiao = edge("accept-terms", { json: { ok: true, version: 4 } });

    const { result } = renderMutation(() => useAcceptTerms());
    await result.current.mutateAsync({ booking_code: "MP7K2X" });

    expect(espiao.ultimoBody).not.toHaveProperty("version");
  });
});
