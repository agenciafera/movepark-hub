import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  OperatorAssistantCompany,
  OperatorAssistantGap,
  OperatorAssistantMessage,
  OperatorPlaybookArticle,
} from "@/types/domain";
import { operatorAssistantKeys } from "./api";

/**
 * Manager › Mia para operadores: conversas, lacunas e a base do operador.
 *
 * Tudo é leitura e escrita direta sob RLS de hub_admin (as três tabelas só abrem para
 * `is_hub_admin()`). Editar um artigo dispara o gatilho que reenfileira a vetorização, então a
 * Mia passa a responder com o texto novo em poucos minutos. Ver docs/specs/assistente-do-operador.md.
 */

export const miaOperadorKeys = {
  all: ["mia-operador-manager"] as const,
  conversas: (companyId: string | null) => [...miaOperadorKeys.all, "conversas", companyId] as const,
  lacunas: (status: string) => [...miaOperadorKeys.all, "lacunas", status] as const,
  artigos: () => [...miaOperadorKeys.all, "artigos"] as const,
  empresas: () => [...miaOperadorKeys.all, "empresas"] as const,
};

export type MensagemComQuem = OperatorAssistantMessage & {
  company: { name: string } | null;
  profile: { full_name: string | null } | null;
};

export type LacunaComQuem = OperatorAssistantGap & {
  company: { name: string } | null;
  profile: { full_name: string | null } | null;
};

const SELECT_QUEM = "*, company:company_id(name), profile:profile_id(full_name)";

/** As últimas falas de todas as conversas, para o Manager agrupar por conversa. */
async function fetchConversas(companyId: string | null): Promise<MensagemComQuem[]> {
  let q = supabase
    .from("operator_assistant_message")
    .select(SELECT_QUEM)
    .order("created_at", { ascending: false })
    .limit(400);
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as MensagemComQuem[];
}

export function useConversasDosOperadores(companyId: string | null) {
  return useQuery({ queryKey: miaOperadorKeys.conversas(companyId), queryFn: () => fetchConversas(companyId) });
}

async function fetchLacunas(status: string): Promise<LacunaComQuem[]> {
  const { data, error } = await supabase
    .from("operator_assistant_gap")
    .select(SELECT_QUEM)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as LacunaComQuem[];
}

export function useLacunas(status: "open" | "resolved" | "ignored") {
  return useQuery({ queryKey: miaOperadorKeys.lacunas(status), queryFn: () => fetchLacunas(status) });
}

export function useResolverLacuna() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; status: "resolved" | "ignored"; nota: string | null; articleId: string | null }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("operator_assistant_gap")
        .update({
          status: p.status,
          resolution_note: p.nota,
          article_id: p.articleId,
          resolved_at: new Date().toISOString(),
          resolved_by: u.user?.id ?? null,
        })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: miaOperadorKeys.all }),
  });
}

async function fetchArtigos(): Promise<OperatorPlaybookArticle[]> {
  const { data, error } = await supabase
    .from("operator_playbook_article")
    .select("*")
    .is("deleted_at", null)
    .order("category")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export function useArtigosDaBase() {
  return useQuery({ queryKey: miaOperadorKeys.artigos(), queryFn: fetchArtigos });
}

export type ArtigoInput = {
  id?: string;
  slug: string;
  title: string;
  category: string;
  body_md: string;
  is_published: boolean;
};

export function useSalvarArtigo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: ArtigoInput): Promise<string> => {
      const { data: u } = await supabase.auth.getUser();
      const linha = {
        slug: a.slug,
        title: a.title,
        category: a.category,
        body_md: a.body_md,
        is_published: a.is_published,
        updated_by: u.user?.id ?? null,
      };
      if (a.id) {
        const { error } = await supabase.from("operator_playbook_article").update(linha).eq("id", a.id);
        if (error) throw error;
        return a.id;
      }
      const { data, error } = await supabase.from("operator_playbook_article").insert(linha).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: miaOperadorKeys.all }),
  });
}

export function useArquivarArtigo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("operator_playbook_article")
        .update({ deleted_at: new Date().toISOString(), is_published: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: miaOperadorKeys.all }),
  });
}

/**
 * Empresas com a Mia liberada. Sem linha, a bolinha não aparece e a Edge recusa; a chave global
 * (`app_setting.operator_assistant.enabled`) continua acima de tudo.
 */
export function useEmpresasLiberadas() {
  return useQuery({
    queryKey: miaOperadorKeys.empresas(),
    queryFn: async (): Promise<OperatorAssistantCompany[]> => {
      const { data, error } = await supabase
        .from("operator_assistant_company")
        .select("company_id, enabled_by, created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLiberarEmpresa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { companyId: string; liberar: boolean }) => {
      const { error } = p.liberar
        ? await supabase.from("operator_assistant_company").insert({ company_id: p.companyId })
        : await supabase.from("operator_assistant_company").delete().eq("company_id", p.companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: miaOperadorKeys.all });
      // A bolinha do hub_admin impersonando a empresa reflete na hora.
      void qc.invalidateQueries({ queryKey: operatorAssistantKeys.all });
    },
  });
}
