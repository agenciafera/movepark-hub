import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/context";
import { caminhoFicha } from "@/lib/urls";

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

export type SavedListingDetail = {
  id: string;
  operator: { slug: string; name: string };
  location: {
    slug: string;
    name: string;
    address: string | null;
    cover_image: string | null;
    /** Caminho da ficha. Nulo quando a unidade ainda não tem slug público. */
    public_path: string | null;
    /** Nome canônico da ficha ("{marca} - Estacionamento {destino}"). */
    public_name: string | null;
  };
  parking_type: { code: string; name: string };
};

/**
 * Os dados exibíveis dos favoritos. Mora aqui junto do resto do favorito; estava
 * dentro de `routes/account/saved.tsx`, e era a única página da conta que falava com
 * o Supabase direto na rota.
 */
export function useSavedListingsDetail(ids: string[]) {
  return useQuery({
    queryKey: ["saved-listings-detail", ids.slice().sort().join(",")],
    queryFn: async (): Promise<SavedListingDetail[]> => {
      if (ids.length === 0) return [];
      // O tipo de vaga (código/nome) vem por company_parking_type → parking_type;
      // location_parking_type não tem "parking_type_code" (isso dava erro PGRST200
      // e deixava a lista de favoritos sempre vazia).
      const { data, error } = await supabase
        .from("location_parking_type")
        .select(
          `
          id,
          location:location!inner (
            slug,
            public_slug,
            public_name,
            name,
            address,
            photos,
            destination:destination ( public_slug ),
            company:company!inner ( slug, name )
          ),
          company_parking_type:company_parking_type!inner (
            parking_type:parking_type!inner ( code, name )
          )
        `,
        )
        .in("id", ids);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const rec = row as unknown as {
          id: string;
          location: {
            slug: string;
            public_slug: string | null;
            public_name: string | null;
            name: string;
            address: string | null;
            photos: unknown;
            destination: { public_slug: string | null } | null;
            company: { slug: string; name: string } | null;
          } | null;
          company_parking_type: {
            parking_type: { code: string; name: string } | null;
          } | null;
        };
        const parkingType = rec.company_parking_type?.parking_type;
        // Capa = 1ª foto da galeria, a mesma regra da busca (search/index.ts).
        const photos = rec.location?.photos;
        const cover =
          Array.isArray(photos) && typeof photos[0] === "string" ? (photos[0] as string) : null;
        return {
          id: rec.id,
          operator: {
            slug: rec.location?.company?.slug ?? "",
            name: rec.location?.company?.name ?? "",
          },
          location: {
            slug: rec.location?.slug ?? "",
            name: rec.location?.name ?? "",
            address: rec.location?.address ?? null,
            cover_image: cover,
            public_name: rec.location?.public_name ?? null,
            public_path:
              rec.location?.destination?.public_slug && rec.location?.public_slug
                ? caminhoFicha(rec.location.destination.public_slug, rec.location.public_slug)
                : null,
          },
          parking_type: {
            code: parkingType?.code ?? "",
            name: parkingType?.name ?? "",
          },
        };
      });
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}
