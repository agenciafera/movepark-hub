import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type Vehicle = {
  id: string;
  profile_id: string;
  license_plate: string;
  model: string | null;
  color: string | null;
  is_default: boolean;
  created_at: string;
};

const KEY = ["my-vehicles"] as const;

export function useMyVehicles(profileId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, profileId ?? "anon"],
    queryFn: async (): Promise<Vehicle[]> => {
      if (!profileId) return [];
      const { data, error } = await supabase
        .from("vehicle")
        .select("id, profile_id, license_plate, model, color, is_default, created_at")
        .eq("profile_id", profileId)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
    enabled: !!profileId,
    staleTime: 60_000,
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      profile_id: string;
      license_plate: string;
      model?: string;
      color?: string;
      is_default?: boolean;
    }): Promise<Vehicle> => {
      if (payload.is_default) {
        await supabase
          .from("vehicle")
          .update({ is_default: false })
          .eq("profile_id", payload.profile_id);
      }
      const { data, error } = await supabase
        .from("vehicle")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as Vehicle;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      profileId: string;
      patch: Partial<Vehicle>;
    }) => {
      if (args.patch.is_default) {
        await supabase
          .from("vehicle")
          .update({ is_default: false })
          .eq("profile_id", args.profileId);
      }
      const { error } = await supabase
        .from("vehicle")
        .update(args.patch)
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("vehicle")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
