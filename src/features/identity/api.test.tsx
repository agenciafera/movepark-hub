import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { edge, renderMutation } from "@/test/msw/supabase";
import { useConfirmAttach, useRequestAttachOtp } from "./api";

/**
 * Contrato de rede do "Meus logins" (ADR-006). É por aqui que um identificador vira
 * CREDENCIAL de login, então é a superfície mais sensível do produto para o cliente:
 * anexar o telefone errado a uma conta é entregar a conta.
 *
 * A verificação de verdade é do servidor (a Edge `attach-identifier` emite e confere
 * o OTP). O que fica preso aqui é que o pedido sai correto e em DOIS passos.
 */

function comSessao(token: string | null) {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: token ? ({ access_token: token } as never) : null },
    error: null,
  } as never);
}

describe("useRequestAttachOtp", () => {
  it("pede o código com canal e identificador, na ação request", async () => {
    comSessao("token-de-teste");
    const espiao = edge("attach-identifier", { json: { status: "sent" } });

    const { result } = renderMutation(() => useRequestAttachOtp());
    await result.current.mutateAsync({ channel: "phone", identifier: "+5519999999999" });

    expect(espiao.ultimoBody).toMatchObject({
      action: "request",
      channel: "phone",
      identifier: "+5519999999999",
    });
  });

  it("pedir código NÃO manda code nem allow_merge", async () => {
    // O primeiro passo só dispara o envio. Se ele carregasse um código, existiria um
    // caminho em que anexar acontece sem passar pela conferência do OTP.
    comSessao("token-de-teste");
    const espiao = edge("attach-identifier", { json: { status: "sent" } });

    const { result } = renderMutation(() => useRequestAttachOtp());
    await result.current.mutateAsync({ channel: "email", identifier: "novo@qa.local" });

    expect(espiao.ultimoBody).not.toHaveProperty("code");
    expect(espiao.ultimoBody).not.toHaveProperty("allow_merge");
  });

  it("sem sessão, não sai chamada nenhuma", async () => {
    comSessao(null);
    const espiao = edge("attach-identifier", { json: {} });

    const { result } = renderMutation(() => useRequestAttachOtp());
    await expect(
      result.current.mutateAsync({ channel: "email", identifier: "a@b.c" }),
    ).rejects.toThrow(/logado/);
    expect(espiao.chamadas).toHaveLength(0);
  });
});

describe("useConfirmAttach", () => {
  it("confirma com canal, identificador e código, na ação confirm", async () => {
    comSessao("token-de-teste");
    const espiao = edge("attach-identifier", { json: { status: "attached" } });

    const { result } = renderMutation(() => useConfirmAttach());
    await result.current.mutateAsync({
      channel: "phone",
      identifier: "+5519999999999",
      code: "123456",
    });

    expect(espiao.ultimoBody).toMatchObject({
      action: "confirm",
      channel: "phone",
      identifier: "+5519999999999",
      code: "123456",
    });
  });

  it("sem pedir explicitamente, allow_merge NÃO vai como true", async () => {
    // Fundir contas junta o histórico de duas pessoas. O merge só pode acontecer no
    // segundo passo, depois de a tela mostrar a prévia e alguém confirmar. Um default
    // truthy aqui fundiria contas na primeira confirmação de código.
    comSessao("token-de-teste");
    const espiao = edge("attach-identifier", { json: { status: "attached" } });

    const { result } = renderMutation(() => useConfirmAttach());
    await result.current.mutateAsync({
      channel: "email",
      identifier: "novo@qa.local",
      code: "123456",
    });

    expect((espiao.ultimoBody as { allow_merge?: boolean }).allow_merge).not.toBe(true);
  });

  it("com o aceite explícito, allow_merge vai true", async () => {
    comSessao("token-de-teste");
    const espiao = edge("attach-identifier", { json: { status: "merged" } });

    const { result } = renderMutation(() => useConfirmAttach());
    await result.current.mutateAsync({
      channel: "email",
      identifier: "novo@qa.local",
      code: "123456",
      allowMerge: true,
    });

    expect((espiao.ultimoBody as { allow_merge: boolean }).allow_merge).toBe(true);
  });

  it("código errado sobe com a mensagem do servidor", async () => {
    comSessao("token-de-teste");
    edge("attach-identifier", { status: 400, json: { error: "Código inválido" } });

    const { result } = renderMutation(() => useConfirmAttach());
    await expect(
      result.current.mutateAsync({ channel: "email", identifier: "a@b.c", code: "000000" }),
    ).rejects.toThrow(/Código inválido/);
  });
});
