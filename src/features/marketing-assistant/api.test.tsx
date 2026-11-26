import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { marketingKeys } from "@/features/marketing/api";
import { edge, falha, renderMutation } from "@/test/msw/supabase";
import { assistenteKeys, useApagarConversa, useDecidirProposta, useRenomearConversa } from "./api";

// Contrato de rede da página Assistente de IA (docs/specs/assistente-marketing.md § 6).

beforeEach(() => {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: { access_token: "jwt" } as never },
    error: null,
  } as never);
});

const CONV = "11111111-2222-3333-4444-555555555555";

describe("useRenomearConversa", () => {
  it("manda a conversa e o título, e recarrega a lista", async () => {
    const chamada = edge("marketing-assistant", { json: { ok: true } });
    const { result, qc } = renderMutation(() => useRenomearConversa());
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    await result.current.mutateAsync({ conversaId: CONV, titulo: "Volta 90 dias" });
    expect(chamada.ultimoBody).toEqual({ acao: "renomear", conversa_id: CONV, titulo: "Volta 90 dias" });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: assistenteKeys.conversas() });
  });
});

describe("useApagarConversa", () => {
  it("manda a conversa e recarrega tudo do assistente", async () => {
    const chamada = edge("marketing-assistant", { json: { ok: true } });
    const { result, qc } = renderMutation(() => useApagarConversa());
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    await result.current.mutateAsync({ conversaId: CONV });
    expect(chamada.ultimoBody).toEqual({ acao: "apagar", conversa_id: CONV });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: assistenteKeys.all });
  });

  it("traz a mensagem de erro da Edge", async () => {
    falha("edge", "marketing-assistant", 404, "Conversa não encontrada.");
    const { result } = renderMutation(() => useApagarConversa());
    await expect(result.current.mutateAsync({ conversaId: CONV })).rejects.toThrow("Conversa não encontrada.");
  });
});

describe("useDecidirProposta", () => {
  it("confirmar manda só o id da proposta e recarrega a Automação", async () => {
    const proposta = {
      id: "p",
      tool: "marketing_run_campaign",
      status: "executed",
      resumo: {},
      resultado: { resumo: "ok" },
      erro: null,
      expires_at: "",
    };
    const chamada = edge("marketing-assistant", { json: { proposta } });
    const { result, qc } = renderMutation(() => useDecidirProposta());
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    const r = await result.current.mutateAsync({ propostaId: "p", decisao: "confirmar" });
    expect(chamada.ultimoBody).toEqual({ acao: "confirmar", proposta_id: "p" });
    expect(r.status).toBe("executed");
    expect(invalidar).toHaveBeenCalledWith({ queryKey: marketingKeys.all });
  });

  it("descartar não recarrega a Automação", async () => {
    edge("marketing-assistant", { json: { proposta: { id: "p", status: "dismissed" } } });
    const { result, qc } = renderMutation(() => useDecidirProposta());
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    await result.current.mutateAsync({ propostaId: "p", decisao: "descartar" });
    expect(invalidar).not.toHaveBeenCalledWith({ queryKey: marketingKeys.all });
  });

  it("traz a recusa do servidor", async () => {
    falha("edge", "marketing-assistant", 410, "Esta proposta venceu. Peça de novo ao assistente.");
    const { result } = renderMutation(() => useDecidirProposta());
    await expect(result.current.mutateAsync({ propostaId: "p", decisao: "confirmar" })).rejects.toThrow("venceu");
  });
});
