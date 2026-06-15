// Lógica pura das chaves de API (operator). Sem React/Supabase → testável (Vitest).
// Ver docs/specs/public-api.md §8.

export type ApiKeyEnvironment = "live" | "test";

// View-model devolvido por operator_list_api_keys (jsonb, SEM key_hash/segredo).
export type ApiKeyView = {
  id: string;
  name: string;
  key_prefix: string;
  environment: ApiKeyEnvironment;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  status: "active" | "revoked" | "expired";
};

// Resposta de operator_create_api_key / rotate (segredo em claro UMA vez).
export type ApiKeySecret = {
  id: string;
  key: string;
  key_prefix: string;
};

// Item do catálogo api_scope.
export type ApiScope = {
  scope: string;
  module: string;
  description: string;
};

export type ApiKeyFormValues = {
  name: string;
  environment: ApiKeyEnvironment;
  scopes: string[];
  expires_at: string; // "YYYY-MM-DD" ou ""
};

export type ApiKeyCreateArgs = {
  p_company_id: string;
  p_name: string;
  p_environment: ApiKeyEnvironment;
  p_scopes: string[];
  p_expires_at: string | null;
};

export const EMPTY_API_KEY_FORM: ApiKeyFormValues = {
  name: "",
  environment: "live",
  scopes: [],
  expires_at: "",
};

/** Valida o form de criação. Retorna a mensagem de erro ou `null`. */
export function validateApiKeyForm(v: ApiKeyFormValues): string | null {
  if (!v.name.trim()) return "Dê um nome à chave (ex.: Integração WPS).";
  if (v.environment !== "live" && v.environment !== "test") return "Ambiente inválido.";
  if (!v.scopes.length) return "Selecione ao menos um escopo.";
  return null;
}

/** Monta os argumentos da RPC `operator_create_api_key`. */
export function buildApiKeyCreateArgs(companyId: string, v: ApiKeyFormValues): ApiKeyCreateArgs {
  return {
    p_company_id: companyId,
    p_name: v.name.trim(),
    p_environment: v.environment,
    p_scopes: v.scopes,
    p_expires_at: v.expires_at ? `${v.expires_at}T23:59:59` : null,
  };
}

/** Agrupa o catálogo de escopos por módulo (para o seletor agrupado). */
export function groupScopesByModule(scopes: ApiScope[]): Record<string, ApiScope[]> {
  return scopes.reduce<Record<string, ApiScope[]>>((acc, s) => {
    (acc[s.module] ??= []).push(s);
    return acc;
  }, {});
}

/** Rótulo de status em PT-BR. */
export function statusLabel(status: ApiKeyView["status"]): string {
  return status === "active" ? "Ativa" : status === "revoked" ? "Revogada" : "Expirada";
}

/** "Nunca usada" ou a data ISO recortada (YYYY-MM-DD). */
export function lastUsedLabel(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "Nunca usada";
}
