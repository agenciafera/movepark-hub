import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CompanyRole, Profile, UserRole } from "@/types/domain";

export type UserListItem = Profile & {
  companies: { id: string; name: string }[];
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
      const { data: links } = await supabase
        .from("profile_company")
        .select("profile_id, company:company(id, name)")
        .in("profile_id", ids);

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
