import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export type Preferences = {
  language?: "pt-BR" | "pt-PT" | "en";
  currency?: "BRL" | "EUR";
  notifications?: {
    email_confirmation?: boolean;
    email_reminder?: boolean;
    email_offers?: boolean;
  };
  cookies?: {
    analytics?: boolean;
    marketing?: boolean;
    accepted_at?: string;
  };
};

export type Profile = Omit<ProfileRow, "preferences"> & {
  preferences: Preferences;
};

const KEY = ["my-profile"] as const;

export function useProfile(profileId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, profileId ?? "anon"],
    queryFn: async (): Promise<Profile | null> => {
      if (!profileId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", profileId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...(data as ProfileRow),
        preferences: ((data as ProfileRow).preferences ?? {}) as Preferences,
      };
    },
    enabled: !!profileId,
    staleTime: 60_000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfileUpdate & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("profiles").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["auth-session"] });
    },
  });
}

export function useSignOutEverywhere() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
    },
  });
}
