import { describe, expect, it } from "vitest";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import { useLinkUserCompany, useUnlinkUserCompany, useUpdateUserRole } from "./api";

/**
 * Contrato de rede da gestão de usuários do Manager. São as três escritas que definem
 * papel de plataforma e vínculo com empresa, ou seja, quem entra em qual painel.
 */

describe("useUpdateUserRole", () => {
  it("altera SÓ o papel, e só da pessoa informada", async () => {
    // O patch tem que ser mínimo: um update que carregasse o perfil inteiro
    // sobrescreveria nome e preferências com o que estava na tela.
    const patch = tabela("profiles", "patch", { json: [] });

    const { result } = renderMutation(() => useUpdateUserRole());
    await result.current.mutateAsync({ id: "u9", role: "hub_admin" });

    expect(patch.ultimoBody).toEqual({ role: "hub_admin" });
    expect(patch.chamadas[0].url).toContain("id=eq.u9");
  });

  it("propaga a recusa do servidor", async () => {
    falha("tabela", "profiles", 403, "sem permissão");

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
