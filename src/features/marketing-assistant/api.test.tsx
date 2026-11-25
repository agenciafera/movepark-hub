import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { marketingKeys } from "@/features/marketing/api";
import { edge, falha, renderMutation } from "@/test/msw/supabase";
import { useConfirmarProposta, useConversar } from "./api";

// Contrato de rede do assistente da Automação (docs/specs/assistente-marketing.md).

beforeEach(() => {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: { access_token: "jwt" } as never },
    error: null,
  } as never);
});

const TURNO = { resposta: "ok", ferramentas: [], propostas: [], gravou: false };

describe("useConversar", () => {
  it("manda só as mensagens e a página; o modelo e as tools ficam no servidor", async () => {
    const chamada = edge("marketing-assistant", { json: TURNO });
    const { result } = renderMutation(() => useConversar());
    await result.current.mutateAsync({
      mensagens: [{ papel: "usuario", texto: "Quem sumiu?" }],
      pagina: { caminho: "/manager/marketing" },
    });
    expect(chamada.ultimoBody).toEqual({
      mensagens: [{ papel: "usuario", texto: "Quem sumiu?" }],
      pagina: { caminho: "/manager/marketing" },
    });
  });

  it("recarrega a tela de marketing só quando o assistente gravou", async () => {
    edge("marketing-assistant", { json: TURNO });
    const { result, qc } = renderMutation(() => useConversar());
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    await result.current.mutateAsync({ mensagens: [{ papel: "usuario", texto: "oi" }], pagina: { caminho: "/manager/marketing" } });
    expect(invalidar).not.toHaveBeenCalled();

    edge("marketing-assistant", { json: { ...TURNO, gravou: true } });
    await result.current.mutateAsync({ mensagens: [{ papel: "usuario", texto: "salva" }], pagina: { caminho: "/manager/marketing" } });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: marketingKeys.all });
  });

  it("traz a mensagem de erro da Edge", async () => {
    falha("edge", "marketing-assistant", 403, "forbidden");
    const { result } = renderMutation(() => useConversar());
    await expect(
      result.current.mutateAsync({ mensagens: [{ papel: "usuario", texto: "oi" }], pagina: { caminho: "/manager/marketing" } }),
    ).rejects.toThrow("forbidden");
  });
});

describe("useConfirmarProposta", () => {
  it("manda a ação de confirmar com a tool e os argumentos", async () => {
    const chamada = edge("marketing-assistant", { json: { resultado: { enabled: false } } });
    const { result, qc } = renderMutation(() => useConfirmarProposta());
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    await result.current.mutateAsync({
      tool: "marketing_set_dispatch_enabled",
      args: { enabled: false, reason: "pausa de dezembro" },
    });
    expect(chamada.ultimoBody).toEqual({
      acao: "confirmar",
      tool: "marketing_set_dispatch_enabled",
      args: { enabled: false, reason: "pausa de dezembro" },
    });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: marketingKeys.all });
  });

  it("traz a recusa do servidor", async () => {
    falha("edge", "marketing-assistant", 400, "Falta a campanha.");
    const { result } = renderMutation(() => useConfirmarProposta());
    await expect(result.current.mutateAsync({ tool: "marketing_run_campaign", args: {} })).rejects.toThrow(
      "Falta a campanha.",
    );
  });
});
