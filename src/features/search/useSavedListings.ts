import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/context";

const LS_KEY = "mp:saved";

function readLocal(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function writeLocal(s: Set<string>) {
  localStorage.setItem(LS_KEY, JSON.stringify(Array.from(s)));
  window.dispatchEvent(new Event("mp:saved-changed"));
}

/** Set de LPT ids salvos. Logado: tabela profile_saved. Anônimo: localStorage. */
export function useSavedListings() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [localTick, setLocalTick] = React.useState(0);

  // Reage a mudanças no localStorage (mesma aba)
  React.useEffect(() => {
    if (session) return;
    const handler = () => setLocalTick((t) => t + 1);
    window.addEventListener("mp:saved-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("mp:saved-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, [session]);

  const remoteIds = useQuery({
    queryKey: ["saved-listings", session?.userId ?? "anon"],
    queryFn: async (): Promise<Set<string>> => {
      if (!session) return new Set();
      const { data, error } = await supabase
        .from("profile_saved")
        .select("location_parking_type_id")
        .eq("profile_id", session.userId);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.location_parking_type_id));
    },
    staleTime: 60_000,
  });

  const ids = session ? (remoteIds.data ?? new Set<string>()) : readLocal();
  // forçar re-render quando localTick mudar (não usar tick diretamente — só na key)
  void localTick;

  const toggle = useMutation({
    mutationFn: async (id: string) => {
      const isSaved = ids.has(id);
      if (session) {
        if (isSaved) {
          await supabase
            .from("profile_saved")
            .delete()
            .eq("profile_id", session.userId)
            .eq("location_parking_type_id", id);
        } else {
          await supabase.from("profile_saved").insert({
            profile_id: session.userId,
            location_parking_type_id: id,
          });
        }
      } else {
        const next = new Set(readLocal());
        if (isSaved) next.delete(id);
        else next.add(id);
        writeLocal(next);
      }
      return { id, nowSaved: !isSaved };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-listings"] });
    },
  });

  return {
    ids,
    isSaved: (id: string) => ids.has(id),
    toggle: (id: string) => toggle.mutate(id),
    isToggling: toggle.isPending,
  };
}
