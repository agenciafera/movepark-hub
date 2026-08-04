import { describe, expect, it } from "vitest";
import { edge, falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useInviteMember, useRemoveMember, useSetMemberRole } from "./api";

/**
 * Contrato de rede da equipe da empresa. Tudo aqui muda QUEM pode fazer o quê dentro
 * de um parceiro, então o que os testes prendem é o alvo: qual empresa e qual pessoa.
 *
 * A recusa de verdade é do servidor (`company_set_member_role` e `company_remove_member`
 * são owner-only no banco, e o convite exige `team:write`). Estes testes provam que a
 * UI pede a coisa certa; quem diz não continua sendo o pgTAP.
 */

describe("useSetMemberRole", () => {
  it("manda empresa, pessoa e papel para a RPC", async () => {
    const espiao = rpc("company_set_member_role", { json: null });

    const { result } = renderMutation(() => useSetMemberRole("c1"));
    await result.current.mutateAsync({ profileId: "u9", role: "manager" });

    expect(espiao.ultimoBody).toMatchObject({
      p_company_id: "c1",
      p_profile_id: "u9",
      p_role: "manager",
    });
  });

  it("a empresa vem do hook, não do argumento da chamada", async () => {
    // O componente fixa a empresa uma vez; a linha da tabela só sabe a pessoa. Se a
    // empresa viesse do argumento, uma tela aberta em duas abas trocaria o papel na
    // empresa errada.
    const espiao = rpc("company_set_member_role", { json: null });

    const { result } = renderMutation(() => useSetMemberRole("c-do-hook"));
    await result.current.mutateAsync({ profileId: "u9", role: "operator" });

    expect((espiao.ultimoBody as { p_company_id: string }).p_company_id).toBe("c-do-hook");
  });

  it("recusa do servidor sobe com a mensagem dele", async () => {
    // "A empresa precisa de ao menos um dono" é a regra que impede a empresa ficar
    // órfã, e ela precisa chegar legível na tela.
    falha("rpc", "company_set_member_role", 400, "A empresa precisa de ao menos um dono");

    const { result } = renderMutation(() => useSetMemberRole("c1"));
    await expect(
      result.current.mutateAsync({ profileId: "u9", role: "operator" }),
    ).rejects.toThrow(/ao menos um dono/);
  });
});

describe("useRemoveMember", () => {
  it("manda empresa e pessoa para a RPC de remoção", async () => {
    const espiao = rpc("company_remove_member", { json: null });

    const { result } = renderMutation(() => useRemoveMember("c1"));
    await result.current.mutateAsync("u9");

    expect(espiao.ultimoBody).toMatchObject({ p_company_id: "c1", p_profile_id: "u9" });
  });

  it("remove pela RPC, nunca por delete direto na tabela", async () => {
    // A RPC é owner-only e guarda a invariante do dono. Um delete direto em
    // profile_company driblaria as duas coisas.
    const viaRpc = rpc("company_remove_member", { json: null });

    const { result } = renderMutation(() => useRemoveMember("c1"));
    await result.current.mutateAsync("u9");

    expect(viaRpc.chamadas).toHaveLength(1);
  });
});

describe("useInviteMember", () => {
  it("chama a Edge com empresa, e-mail e papel", async () => {
    const espiao = edge("invite-company-member", { json: { ok: true } });

    const { result } = renderMutation(() => useInviteMember("c1"));
    await result.current.mutateAsync({ email: "novo@empresa.local", role: "finance" });

    expect(espiao.ultimoBody).toMatchObject({
      company_id: "c1",
      email: "novo@empresa.local",
      role: "finance",
    });
  });

  it("resposta 200 com ok false ainda é falha", async () => {
    // A Edge responde 200 e sinaliza o erro no corpo. Sem esta checagem a tela
    // mostraria "convite enviado" para um convite que não saiu.
    edge("invite-company-member", { json: { ok: false, error: "e-mail já vinculado" } });

    const { result } = renderMutation(() => useInviteMember("c1"));
    await expect(
      result.current.mutateAsync({ email: "ja@existe.local", role: "operator" }),
    ).rejects.toThrow(/já vinculado/);
  });
});
