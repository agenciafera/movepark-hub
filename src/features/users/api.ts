import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CompanyRole, UserRole } from "@/types/domain";

export type LoginChannel = "email" | "whatsapp" | "google";

/** Uma linha de Manager › Usuários, como a RPC `admin_list_users` devolve. */
export type UserListItem = {
  id: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  /** Contato vivo, lido de auth.users pela RPC (ADR-006). */
  email: string | null;
  phone: string | null;
  /** Último login: o nosso registro, ou `auth.users.last_sign_in_at`. */
  last_login_at: string | null;
  /** Canal do último login: registrado pelo front; palpite do banco para logins antigos. */
  last_login_channel: LoginChannel | null;
  /** Testador: enxerga unidade em rascunho no site e compra como cliente (16/09/2026). */
  is_tester: boolean;
  companies: { id: string; name: string }[];
};

export type UsersPage = { total: number; rows: UserListItem[] };

export type UsersQuery = { search: string; page: number; pageSize: number };

export const usersKeys = {
  all: ["users"] as const,
  list: (q: UsersQuery) => [...usersKeys.all, "list", q] as const,
};

/**
 * Lista paginada NO SERVIDOR (16/09/2026). A tela carregava 200 perfis e filtrava no navegador,
 * o que trunca a lista quando a base cresce e não acha ninguém por e-mail ou telefone: esses
 * dois moram em auth.users, fora do alcance do PostgREST (ADR-006). A RPC de hub_admin busca,
 * pagina e traz contato, empresas, testador e o último canal de login numa ida só.
 */
export function useUsers(q: UsersQuery) {
  return useQuery({
    queryKey: usersKeys.list(q),
    queryFn: async (): Promise<UsersPage> => {
      // `admin_list_users` ainda não está em `database.ts`; cast com o rpc amarrado ao client.
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: "admin_list_users",
        args: { p_search: string | null; p_limit: number; p_offset: number },
      ) => PromiseLike<{ data: UsersPage | null; error: { message: string } | null }>;
      const { data, error } = await rpc("admin_list_users", {
        p_search: q.search.trim() || null,
        p_limit: q.pageSize,
        p_offset: (q.page - 1) * q.pageSize,
      });
      if (error) throw error;
      return data ?? { total: 0, rows: [] };
    },
    // Trocar de página ou digitar na busca mantém a tabela anterior na tela até a nova chegar,
    // em vez de piscar o esqueleto a cada tecla.
    placeholderData: (previous) => previous,
  });
}

/**
 * Troca o papel de plataforma de um usuário.
 *
 * Vai por RPC, e não por `update` na tabela, porque `profiles.role` saiu do alcance de
 * `authenticated`: a coluna era gravável pelo dono da própria linha, então qualquer conta
 * criada no `/login` virava `hub_admin` com um PATCH no próprio perfil. RLS corta linha,
 * coluna é grant, e o grant foi revogado em `20261017103000`. A RPC é o caminho legítimo
 * que sobra, gateada por `is_hub_admin()` no servidor.
 *
 * Ela recusa alterar o próprio papel: o último admin que se rebaixa tranca o painel para
 * todo mundo, e sair desse estado exige acesso direto ao banco.
 */
export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      const { error } = await supabase.rpc("admin_set_user_role", {
        p_user_id: id,
        p_role: role,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKeys.all }),
  });
}

export function useLinkUserCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      companyId,
      role = "owner",
    }: {
      profileId: string;
      companyId: string;
      role?: CompanyRole;
    }) => {
      const { error } = await supabase
        .from("profile_company")
        .upsert({ profile_id: profileId, company_id: companyId, role });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKeys.all }),
  });
}

export function useUnlinkUserCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, companyId }: { profileId: string; companyId: string }) => {
      const { error } = await supabase
        .from("profile_company")
        .delete()
        .eq("profile_id", profileId)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKeys.all }),
  });
}

/**
 * Marca ou desmarca um testador (16/09/2026). Testador enxerga unidade em RASCUNHO no site,
 * na busca e na ficha, e compra como cliente comum; é o "test user" do Facebook. Vai por RPC
 * gateada por `is_hub_admin()` no servidor, e a RLS de `tester_user` só deixa hub_admin
 * escrever, então uma conta comum não se promove a testadora.
 */
export function useSetTester() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      // `admin_set_tester` ainda não está em `database.ts`; cast com o rpc amarrado ao client.
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: "admin_set_tester",
        args: { p_user_id: string; p_enabled: boolean },
      ) => PromiseLike<{ error: { message: string } | null }>;
      const { error } = await rpc("admin_set_tester", { p_user_id: id, p_enabled: enabled });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKeys.all }),
  });
}
