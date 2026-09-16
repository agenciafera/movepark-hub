import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CompanyRole, Profile, UserRole } from "@/types/domain";

export type UserListItem = Profile & {
  companies: { id: string; name: string }[];
  /** Testador: enxerga unidade em rascunho no site e compra como cliente (16/09/2026). */
  is_tester: boolean;
};

export const usersKeys = {
  all: ["users"] as const,
  list: () => [...usersKeys.all, "list"] as const,
};

export function useUsers() {
  return useQuery({
    queryKey: usersKeys.list(),
    queryFn: async (): Promise<UserListItem[]> => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      if (!profiles?.length) return [];

      const ids = profiles.map((p) => p.id);
      const [{ data: links }, { data: testers }] = await Promise.all([
        supabase
          .from("profile_company")
          .select("profile_id, company:company(id, name)")
          .in("profile_id", ids),
        // `tester_user` ainda não está em `database.ts` (gen types incompleto); cast na tabela.
        (
          supabase.from.bind(supabase) as unknown as (t: "tester_user") => {
            select: (q: "user_id") => {
              in: (c: "user_id", v: string[]) => PromiseLike<{ data: unknown }>;
            };
          }
        )("tester_user")
          .select("user_id")
          .in("user_id", ids),
      ]);
      const testerIds = new Set(
        ((testers ?? []) as unknown as Array<{ user_id: string }>).map((t) => t.user_id),
      );

      const byProfile = new Map<string, { id: string; name: string }[]>();
      for (const link of (links ?? []) as unknown as Array<{
        profile_id: string;
        company: { id: string; name: string } | null;
      }>) {
        const company = link.company;
        if (!company) continue;
        const list = byProfile.get(link.profile_id) ?? [];
        list.push(company);
        byProfile.set(link.profile_id, list);
      }

      return profiles.map((p) => ({
        ...(p as Profile),
        companies: byProfile.get(p.id) ?? [],
        is_tester: testerIds.has(p.id),
      }));
    },
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
