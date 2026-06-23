import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CompanyMember, CompanyRole } from "@/types/domain";

export const teamKeys = {
  all: ["company-members"] as const,
  list: (companyId: string) => [...teamKeys.all, companyId] as const,
};

/** Membros da empresa (RPC SECURITY DEFINER — qualquer membro vê o roster). */
export function useCompanyMembers(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId ? teamKeys.list(companyId) : [...teamKeys.all, "none"],
    enabled: !!companyId,
    queryFn: async (): Promise<CompanyMember[]> => {
      const { data, error } = await supabase.rpc("company_list_members", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return (data ?? []) as CompanyMember[];
    },
  });
}

/** Altera o papel de um membro (owner-only no banco). */
export function useSetMemberRole(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { profileId: string; role: CompanyRole }): Promise<void> => {
      const { error } = await supabase.rpc("company_set_member_role", {
        p_company_id: companyId!,
        p_profile_id: args.profileId,
        p_role: args.role,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

/** Convida um novo usuário por e-mail (Edge invite-company-member; exige team:write). */
export function useInviteMember(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { email: string; role: CompanyRole }): Promise<void> => {
      const { data, error } = await supabase.functions.invoke("invite-company-member", {
        body: { company_id: companyId, email: args.email, role: args.role },
      });
      if (error) throw new Error(error.message);
      if (data && (data as { ok?: boolean }).ok === false) {
        throw new Error((data as { error?: string }).error ?? "Falha ao convidar");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

/** Desvincula um membro da empresa (owner-only no banco). */
export function useRemoveMember(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profileId: string): Promise<void> => {
      const { error } = await supabase.rpc("company_remove_member", {
        p_company_id: companyId!,
        p_profile_id: profileId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}
