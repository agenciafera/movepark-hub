import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Documento legal (Termos/Privacidade) versionado — conteúdo editável no Manager. */
export type LegalDocument = {
  slug: string;
  title: string;
  version: number;
  content: string; // HTML
  published_at: string;
};

export type LegalDocumentVersion = {
  id: string;
  version: number;
  published_at: string;
  published_by: string | null;
};

export const legalKeys = {
  all: ["legal"] as const,
  doc: (slug: string) => [...legalKeys.all, "doc", slug] as const,
  versions: (slug: string) => [...legalKeys.all, "versions", slug] as const,
};

async function fetchLegalDocument(slug: string): Promise<LegalDocument | null> {
  const { data, error } = await supabase.rpc("get_current_legal_document", { p_slug: slug });
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

/** Versão vigente publicada de um documento legal (renderiza /termos e /privacidade). */
export function useLegalDocument(slug: string) {
  return useQuery({
    queryKey: legalKeys.doc(slug),
    queryFn: () => fetchLegalDocument(slug),
    staleTime: 60_000,
  });
}

async function fetchVersions(slug: string): Promise<LegalDocumentVersion[]> {
  const { data, error } = await supabase
    .from("legal_document_version")
    .select("id, version, published_at, published_by")
    .eq("document_slug", slug)
    .order("version", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Histórico de versões (somente leitura) — exibido no editor do Manager. */
export function useLegalDocumentVersions(slug: string) {
  return useQuery({ queryKey: legalKeys.versions(slug), queryFn: () => fetchVersions(slug) });
}

/** Publica uma nova versão de um documento legal (só hub_admin, gateado no servidor). */
export function usePublishLegalDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { slug: string; content: string }) => {
      const { data, error } = await supabase.rpc("publish_legal_document", {
        p_slug: args.slug,
        p_content: args.content,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: legalKeys.all }),
  });
}

/** Registra o aceite explícito dos Termos para uma reserva (opt-in do checkout) — Edge accept-terms. */
export function useAcceptTerms() {
  return useMutation({
    mutationFn: async (args: { booking_code: string }): Promise<{ ok: boolean; version: number | null }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Você precisa estar logado");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-terms`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Falha ao registrar o aceite (HTTP ${res.status})`);
      }
      return res.json();
    },
  });
}
