import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/context";

const LS_KEY = "mp:saved";

/** Ids de LPT que o visitante anônimo tentou favoritar (intenção pendente até logar). */
function readLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as string[]) : [];
  } catch {
    return [];
  }
}
function writeLocal(ids: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(ids));
}
function clearLocal() {
  localStorage.removeItem(LS_KEY);
}

/**
 * Migra pra `profile_saved` os favoritos que o visitante marcou antes de logar
 * (ficam guardados no localStorage). Idempotente: usa upsert com a PK
 * (profile_id, location_parking_type_id) e ignora duplicados. Só limpa o
 * localStorage quando o upsert dá certo (em erro, tenta de novo no próximo login).
 */
export async function migratePendingSaves(profileId: string): Promise<number> {
  const pending = readLocal();
  if (pending.length === 0) return 0;
  const rows = pending.map((id) => ({
    profile_id: profileId,
    location_parking_type_id: id,
  }));
  const { error } = await supabase.from("profile_saved").upsert(rows, {
    onConflict: "profile_id,location_parking_type_id",
    ignoreDuplicates: true,
  });
  if (error) throw error;
  clearLocal();
  return rows.length;
}

/**
 * Favoritos do usuário. Favoritar **exige login**: o anônimo não tem estado
 * salvo (coração sempre vazio) e, ao clicar, é levado ao `/login` (a intenção
 * fica guardada e é migrada pra conta no login). Logado grava em `profile_saved`.
 */
export function useSavedListings() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

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
    enabled: !!session,
    staleTime: 60_000,
  });

  // Anônimo não tem favoritos salvos (favoritar exige login).
  const ids = session ? (remoteIds.data ?? new Set<string>()) : new Set<string>();

  const toggle = useMutation({
    mutationFn: async (id: string) => {
      if (!session) return { id, nowSaved: false };
      const isSaved = ids.has(id);
      if (isSaved) {
        const { error } = await supabase
          .from("profile_saved")
          .delete()
          .eq("profile_id", session.userId)
          .eq("location_parking_type_id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("profile_saved").insert({
          profile_id: session.userId,
          location_parking_type_id: id,
        });
        if (error) throw error;
      }
      return { id, nowSaved: !isSaved };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-listings"] });
    },
  });

  function requestToggle(id: string) {
    if (!session) {
      // Favoritar exige login: guarda a intenção e leva pro login, voltando pra
      // esta página depois (o favorito é migrado pra conta no login).
      const pending = new Set(readLocal());
      pending.add(id);
      writeLocal(Array.from(pending));
      const target = `${location.pathname}${location.search}`;
      navigate(`/login?next=${encodeURIComponent(target)}`);
      return;
    }
    toggle.mutate(id);
  }

  return {
    ids,
    isSaved: (id: string) => ids.has(id),
    toggle: requestToggle,
    isToggling: toggle.isPending,
  };
}

/**
 * Efeito de root: quando a sessão aparece (login), migra os favoritos pendentes
 * do localStorage pra `profile_saved`. Roda uma vez por usuário; em erro, libera
 * pra tentar de novo. Monte em UM lugar só (`SavedListingsSync`).
 */
export function useSyncSavedListingsOnLogin() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const doneFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!session) {
      doneFor.current = null;
      return;
    }
    if (doneFor.current === session.userId) return;
    doneFor.current = session.userId;
    migratePendingSaves(session.userId)
      .then((migrated) => {
        if (migrated > 0) qc.invalidateQueries({ queryKey: ["saved-listings"] });
      })
      .catch(() => {
        // Falhou: libera pra tentar de novo (não perde a intenção do usuário).
        doneFor.current = null;
      });
  }, [session, qc]);
}
