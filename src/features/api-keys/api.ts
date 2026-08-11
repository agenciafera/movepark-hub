// Acesso a dados das chaves de API (operator). Hooks TanStack Query sobre as RPCs
// SECURITY DEFINER. Ver docs/specs/public-api.md §8.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  ApiKeyCreateArgs,
  ApiKeySecret,
  ApiKeyView,
  ApiScope,
} from "./api-keys.logic";

export const apiKeysKeys = {
  all: ["api-keys"] as const,
  list: (companyId: string) => [...apiKeysKeys.all, "list", companyId] as const,
  scopes: () => [...apiKeysKeys.all, "scopes"] as const,
};

// ── Catálogo de escopos (tabela de referência api_scope) ─────────────────────
//
// Filtra o que a tela pode oferecer. Sem isso a lista trazia os 34 escopos do
// catálogo, incluindo os de plataforma (`blog:write`, `checkout:link`) e os
// só-internos (`payouts:write`, `team:write`): o parceiro via na tela permissão
// que não é dele. O servidor recusa em `api_assert_scopes` (migration
// 20261002000000), e este filtro é a segunda camada, para a tela não prometer o
// que a RPC vai negar.
async function fetchScopes(): Promise<ApiScope[]> {
  const { data, error } = await supabase
    .from("api_scope")
    .select("scope, module, description")
    .eq("assignable_to_api_key", true)
    .eq("is_platform_scope", false)
    .order("module")
    .order("scope");
  if (error) throw error;
  return (data ?? []) as ApiScope[];
}

export function useApiScopes() {
  return useQuery({ queryKey: apiKeysKeys.scopes(), queryFn: fetchScopes, staleTime: 5 * 60_000 });
}

// ── Lista de chaves da empresa (sem hash/segredo) ────────────────────────────
async function fetchApiKeys(companyId: string): Promise<ApiKeyView[]> {
  const { data, error } = await supabase.rpc("operator_list_api_keys", { p_company_id: companyId });
  if (error) throw new Error(error.message);
  return (data ?? []) as ApiKeyView[];
}

export function useCompanyApiKeys(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId ? apiKeysKeys.list(companyId) : [...apiKeysKeys.all, "list", "none"],
    enabled: !!companyId,
    queryFn: () => fetchApiKeys(companyId!),
  });
}

function useApiKeyInvalidate(companyId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: apiKeysKeys.all });
    if (companyId) qc.invalidateQueries({ queryKey: apiKeysKeys.list(companyId) });
  };
}

// ── Mutations ────────────────────────────────────────────────────────────────
export function useCreateApiKey(companyId: string | undefined) {
  const invalidate = useApiKeyInvalidate(companyId);
  return useMutation({
    mutationFn: async (args: ApiKeyCreateArgs): Promise<ApiKeySecret> => {
      const { data, error } = await supabase.rpc("operator_create_api_key", args as never);
      if (error) throw new Error(error.message);
      return data as unknown as ApiKeySecret; // segredo em claro — exibir UMA vez
    },
    onSuccess: invalidate,
  });
}

export function useRotateApiKey(companyId: string | undefined) {
  const invalidate = useApiKeyInvalidate(companyId);
  return useMutation({
    mutationFn: async (apiKeyId: string): Promise<ApiKeySecret> => {
      const { data, error } = await supabase.rpc("operator_rotate_api_key", { p_api_key_id: apiKeyId });
      if (error) throw new Error(error.message);
      return data as unknown as ApiKeySecret;
    },
    onSuccess: invalidate,
  });
}

export function useRevokeApiKey(companyId: string | undefined) {
  const invalidate = useApiKeyInvalidate(companyId);
  return useMutation({
    mutationFn: async (apiKeyId: string): Promise<void> => {
      const { error } = await supabase.rpc("operator_revoke_api_key", { p_api_key_id: apiKeyId });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateApiKeyScopes(companyId: string | undefined) {
  const invalidate = useApiKeyInvalidate(companyId);
  return useMutation({
    mutationFn: async (args: { id: string; scopes: string[] }): Promise<void> => {
      const { error } = await supabase.rpc("operator_update_api_key_scopes", {
        p_api_key_id: args.id,
        p_scopes: args.scopes,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}
