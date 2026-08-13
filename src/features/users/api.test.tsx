import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc, tabela } from "@/test/msw/supabase";
import { useLinkUserCompany, useUnlinkUserCompany, useUpdateUserRole } from "./api";

/**
 * Contrato de rede da gestão de usuários do Manager. São as três escritas que definem
 * papel de plataforma e vínculo com empresa, ou seja, quem entra em qual painel.
 */

describe("useUpdateUserRole", () => {
  it("vai pela RPC, e não por update na tabela", async () => {
    // É o ponto inteiro de 20261017103000: `profiles.role` saiu do alcance de
    // `authenticated`, porque a coluna era gravável pelo dono da própria linha e
    // qualquer conta virava hub_admin com um PATCH no próprio perfil. Se alguém
    // reescrever este hook como `.from("profiles").update({ role })`, a tela quebra
    // com 42501 em produção, e é este teste que avisa antes.
    const chamada = rpc("admin_set_user_role", { json: null });
    const patch = tabela("profiles", "patch", { json: [] });

    const { result } = renderMutation(() => useUpdateUserRole());
    await result.current.mutateAsync({ id: "u9", role: "hub_admin" });

    expect(chamada.ultimoBody).toEqual({ p_user_id: "u9", p_role: "hub_admin" });
    expect(patch.chamadas).toHaveLength(0);
  });

  it("propaga a recusa do servidor", async () => {
    falha("rpc", "admin_set_user_role", 403, "Sem permissão para alterar o papel de um usuário.");

    const { result } = renderMutation(() => useUpdateUserRole());
    await expect(
      result.current.mutateAsync({ id: "u9", role: "hub_admin" }),
    ).rejects.toThrow();
  });
});

describe("useLinkUserCompany", () => {
  it("vincula com a tripla pessoa, empresa e papel", async () => {
    const up = tabela("profile_company", "post", { json: [] });

    const { result } = renderMutation(() => useLinkUserCompany());
    await result.current.mutateAsync({ profileId: "u9", companyId: "c1", role: "manager" });

    expect(up.ultimoBody).toMatchObject({
      profile_id: "u9",
      company_id: "c1",
      role: "manager",
    });
  });

  it("sem papel informado, o vínculo nasce como dono", async () => {
    // O default é o papel mais forte, então vale estar preso: se alguém mudar para
    // "operator" achando que é mais seguro, o primeiro vínculo de uma empresa nova
    // deixaria a empresa sem dono.
    const up = tabela("profile_company", "post", { json: [] });

    const { result } = renderMutation(() => useLinkUserCompany());
    await result.current.mutateAsync({ profileId: "u9", companyId: "c1" });

    expect((up.ultimoBody as { role: string }).role).toBe("owner");
  });
});

describe("useUnlinkUserCompany", () => {
  it("apaga o vínculo filtrando pelos DOIS lados", async () => {
    // Filtrar só por profile_id desvincularia a pessoa de todas as empresas de uma
    // vez, e a tela não mostraria diferença até alguém tentar entrar.
    const del = tabela("profile_company", "delete", { json: [] });

    const { result } = renderMutation(() => useUnlinkUserCompany());
    await result.current.mutateAsync({ profileId: "u9", companyId: "c1" });

    expect(del.chamadas[0].url).toContain("profile_id=eq.u9");
    expect(del.chamadas[0].url).toContain("company_id=eq.c1");
  });
});
