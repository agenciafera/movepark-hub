import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const appSettingsKeys = { all: ["app-settings"] as const };

export function useAppSettings() {
  return useQuery({
    queryKey: appSettingsKeys.all,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from("app_setting").select("key, value");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    },
  });
}

export function useUpdateAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: Record<string, string>) => {
      const rows = Object.entries(entries).map(([key, value]) => ({ key, value }));
      const { error } = await supabase.from("app_setting").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: appSettingsKeys.all }),
  });
}
