import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** O que a RPC `admin_search` sabe devolver. */
export type SearchKind = "booking" | "location" | "coupon";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  /** Empresa dona do registro. O manager precisa dela para rotear a unidade. */
  company_id: string | null;
};

export const commandPaletteKeys = {
  all: ["command-palette"] as const,
  search: (term: string) => [...commandPaletteKeys.all, "search", term] as const,
};

/**
 * Termo com menos de 2 caracteres não vai ao banco. A RPC já devolve vazio
 * nesse caso, mas segurar aqui evita a ida de rede a cada primeira tecla.
 */
export const MIN_TERM = 2;

async function fetchSearch(term: string): Promise<SearchHit[]> {
  const { data, error } = await supabase.rpc("admin_search", {
    p_query: term,
    p_limit: 5,
  });
  if (error) throw error;
  return (data ?? []) as SearchHit[];
}

export function useAdminSearch(term: string) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: commandPaletteKeys.search(trimmed),
    queryFn: () => fetchSearch(trimmed),
    enabled: trimmed.length >= MIN_TERM,
    // A palette dispara a cada tecla: 30s de cache poupa o banco quando o
    // usuário apaga uma letra e digita de novo.
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}
