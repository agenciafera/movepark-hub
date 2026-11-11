import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/context";
import { useProfile, type Profile } from "./api";

/**
 * Preferência de tela da pessoa logada (11/11/2026), guardada no perfil em
 * `profiles.preferences.ui.<chave>`. Vale em qualquer navegador; nada vai para localStorage.
 *
 * A escrita passa pela RPC `set_my_ui_preference`, que mexe só no caminho da chave: um `update` em
 * `profiles` trocaria o JSON inteiro e apagaria o que o checkout guardou nele.
 */
export function useUiPreference(key: string) {
  const { session } = useAuth();
  const profile = useProfile(session?.userId);
  const ui = (profile.data?.preferences as { ui?: Record<string, unknown> } | undefined)?.ui;
  return {
    value: ui?.[key] as unknown,
    isLoading: profile.isLoading,
    userId: session?.userId,
  };
}

export function useSetUiPreference(key: string) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const userId = session?.userId;
  return useMutation({
    mutationFn: async (value: unknown) => {
      // A RPC é nova e o `database.ts` não a conhece até o próximo gen:types.
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: Error | null }>
      )("set_my_ui_preference", { p_key: key, p_value: value ?? null });
      if (error) throw error;
      return (data ?? {}) as Record<string, unknown>;
    },
    onSuccess: (ui) => {
      // O servidor devolve o `ui` inteiro já gravado: a tela usa ele, sem nova consulta.
      qc.setQueryData<Profile | null>(["my-profile", userId ?? "anon"], (old) =>
        old ? { ...old, preferences: { ...old.preferences, ui } as Profile["preferences"] } : old,
      );
    },
  });
}
