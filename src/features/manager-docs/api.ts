import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Chaves de plataforma (`api_key.company_id is null`).
 *
 * Só a Movepark emite: as três RPCs abaixo abrem com `is_hub_admin()`, e a trava
 * de tabela (`api_key_assert_ownership`) recusa misturar escopo de empresa com
 * escopo de plataforma na mesma chave, por qualquer caminho de escrita.
 *
 * Elas não aparecem em `/operator/api-keys`, porque aquela listagem filtra por
 * `company_id` e nula nunca casa. Nenhum parceiro vê nem revoga a chave da
 * Movepark.
 */

export type PlatformKey = {
  id: string;
  name: string;
  key_prefix: string;
  environment: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  status: "active" | "revoked" | "expired";
};

export const platformKeysKeys = {
  all: ["platform-api-keys"] as const,
  scopes: ["platform-api-keys", "scopes"] as const,
};

export function usePlatformKeys() {
  return useQuery({
    queryKey: platformKeysKeys.all,
    queryFn: async (): Promise<PlatformKey[]> => {
      const { data, error } = await supabase.rpc("hub_list_platform_api_keys");
      if (error) throw new Error(error.message);
      return (data ?? []) as PlatformKey[];
    },
  });
}

/** Só os escopos de plataforma: são os únicos que uma chave da Movepark aceita. */
export function usePlatformScopes() {
  return useQuery({
    queryKey: platformKeysKeys.scopes,
    queryFn: async (): Promise<{ scope: string; description: string | null }[]> => {
      const { data, error } = await supabase
        .from("api_scope")
        .select("scope, description")
        .eq("is_platform_scope", true)
        .eq("assignable_to_api_key", true)
        .order("scope");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreatePlatformKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { name: string; environment: "live" | "test"; scopes: string[] }) => {
      const { data, error } = await supabase.rpc("hub_create_platform_api_key", {
        p_name: p.name,
        p_environment: p.environment,
        p_scopes: p.scopes,
      });
      if (error) throw new Error(error.message);
      // O segredo vem uma vez só; quem chama tem que mostrar na hora.
      return data as { id: string; key: string; key_prefix: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: platformKeysKeys.all }),
  });
}

export function useRevokePlatformKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("hub_revoke_platform_api_key", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: platformKeysKeys.all }),
  });
}
