import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc, tabela } from "@/test/msw/supabase";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import {
  useLinkUserCompany,
  useSetTester,
  useUnlinkUserCompany,
  useUpdateUserRole,
  useUsers,
} from "./api";

describe("useUsers", () => {
  it("lista pela RPC admin_list_users com busca, limite e offset da página", async () => {
    // A lista saiu do PostgREST: e-mail e telefone moram em auth.users (ADR-006), e a paginação
    // no navegador truncava em 200. Se alguém voltar a `.from("profiles")`, a busca por e-mail
    // some em silêncio, e é este teste que avisa.
    const chamada = rpc("admin_list_users", { json: { total: 1, rows: [] } });
    const get = tabela("profiles", "get", { json: [] });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUsers({ search: " maria ", page: 3, pageSize: 25 }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chamada.ultimoBody).toEqual({ p_search: "maria", p_limit: 25, p_offset: 50 });
    expect(get.chamadas).toHaveLength(0);
    expect(result.current.data).toEqual({ total: 1, rows: [] });
  });
});

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

describe("useSetTester", () => {
  it("marca pela RPC admin_set_tester, nunca por insert direto na tabela", async () => {
    // A RLS de tester_user até deixaria hub_admin inserir, mas a RPC é o caminho que grava
    // quem marcou e recusa conta comum com mensagem, em vez de 42501 seco.
    const chamada = rpc("admin_set_tester", { json: null });
    const insercao = tabela("tester_user", "post", { json: [] });

    const { result } = renderMutation(() => useSetTester());
    await result.current.mutateAsync({ id: "u9", enabled: true });

    expect(chamada.ultimoBody).toEqual({ p_user_id: "u9", p_enabled: true });
    expect(insercao.chamadas).toHaveLength(0);
  });

  it("desmarcar manda enabled false", async () => {
    const chamada = rpc("admin_set_tester", { json: null });
    const { result } = renderMutation(() => useSetTester());
    await result.current.mutateAsync({ id: "u9", enabled: false });
    expect(chamada.ultimoBody).toEqual({ p_user_id: "u9", p_enabled: false });
  });

  it("propaga a recusa do servidor", async () => {
    falha("rpc", "admin_set_tester", 403, "Só hub_admin marca testador.");
    const { result } = renderMutation(() => useSetTester());
    await expect(result.current.mutateAsync({ id: "u9", enabled: true })).rejects.toThrow();
  });
});
