import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { edge, renderMutation } from "@/test/msw/supabase";
import { useSubmitGo2ParkInterest } from "./go2parkApi";
import { usePartnerAction } from "./managerApi";

/**
 * Contrato de rede das ações de onboarding do parceiro.
 *
 * `usePartnerAction` é a que decide a vida do lead: aprovar dispara o convite por
 * e-mail e cria o acesso; rejeitar fecha a porta. As três ações moram na mesma Edge e
 * se distinguem por um campo, então trocar esse campo troca o desfecho.
 */

function comSessao(token: string | null) {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: token ? ({ access_token: token } as never) : null },
    error: null,
  } as never);
}

describe("usePartnerAction", () => {
  it("aprovar manda a empresa e a ação approve", async () => {
    comSessao("token-de-teste");
    const espiao = edge("approve-partner", { json: { ok: true, status: "approved" } });

    const { result } = renderMutation(() => usePartnerAction());
    await result.current.mutateAsync({ company_id: "c1", action: "approve" });

    expect(espiao.ultimoBody).toMatchObject({ company_id: "c1", action: "approve" });
  });

  it("rejeitar leva o motivo junto", async () => {
    // O motivo vai no e-mail que o lead recebe. Perdê-lo aqui manda uma recusa seca.
    comSessao("token-de-teste");
    const espiao = edge("approve-partner", { json: { ok: true, status: "rejected" } });

    const { result } = renderMutation(() => usePartnerAction());
    await result.current.mutateAsync({
      company_id: "c1",
      action: "reject",
      rejection_reason: "Fora da área de atendimento",
    });

    expect(espiao.ultimoBody).toMatchObject({
      action: "reject",
      rejection_reason: "Fora da área de atendimento",
    });
  });

  it("a ação vai íntegra: aprovar não pode virar reenviar convite", async () => {
    // As três ações têm desfechos diferentes e irreversíveis do lado do lead. Aprovar
    // cria acesso; reenviar só manda outro e-mail. Trocar uma pela outra ou aprova sem
    // querer, ou deixa o parceiro esperando um acesso que nunca foi criado.
    comSessao("token-de-teste");
    const espiao = edge("approve-partner", { json: { ok: true, status: "pending" } });

    const { result } = renderMutation(() => usePartnerAction());
    await result.current.mutateAsync({ company_id: "c1", action: "resend_invite" });

    expect((espiao.ultimoBody as { action: string }).action).toBe("resend_invite");
  });

  it("sem sessão, nem chega a pedir", async () => {
    comSessao(null);
    const espiao = edge("approve-partner", { json: {} });

    const { result } = renderMutation(() => usePartnerAction());
    await expect(
      result.current.mutateAsync({ company_id: "c1", action: "approve" }),
    ).rejects.toThrow(/Sess/);
    expect(espiao.chamadas).toHaveLength(0);
  });

  it("recusa do servidor sobe com a mensagem dele", async () => {
    comSessao("token-de-teste");
    edge("approve-partner", { status: 400, json: { error: "lead já aprovado" } });

    const { result } = renderMutation(() => usePartnerAction());
    await expect(
      result.current.mutateAsync({ company_id: "c1", action: "approve" }),
    ).rejects.toThrow(/já aprovado/);
  });
});

describe("useSubmitGo2ParkInterest", () => {
  it("manda a empresa para a Edge de interesse", async () => {
    const espiao = edge("submit-go2park-interest", { json: { ok: true } });

    const { result } = renderMutation(() => useSubmitGo2ParkInterest());
    await result.current.mutateAsync("c1");

    expect(espiao.ultimoBody).toEqual({ company_id: "c1" });
  });
});
