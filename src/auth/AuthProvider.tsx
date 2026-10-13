import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { storedPhoneToE164 } from "@/lib/identifiers";
import type { CompanyRole, Session, UserRole } from "@/types/domain";
import { AuthContext, type AuthContextValue } from "./context";
import { recordLoginChannel } from "./loginChannel";
import { resolveActiveCompanyId } from "./activeCompany";

const IMPERSONATION_KEY = "mp:impersonated-company-id";
/** Empresa ativa do operador com mais de uma (13/10/2026). Fica no aparelho, como a impersonation. */
const ACTIVE_COMPANY_KEY = "mp:active-company-id";

async function loadSession(): Promise<Session | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: profile }, { data: links }, { data: roleScopes }, { data: isTester }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name, role")
        .eq("id", auth.user.id)
        .maybeSingle(),
      // Ordem do vínculo: quem tem mais de uma empresa começa pela primeira que recebeu.
      supabase
        .from("profile_company")
        .select("company_id, role")
        .eq("profile_id", auth.user.id)
        .order("created_at"),
      // Presets fixos papel→escopo (ADR-005). Tabela pequena, leitura pública p/ authenticated.
      supabase.from("company_role_scope").select("role, scope"),
      // Testador enxerga rascunho no site (16/09/2026). `is_tester` ainda não está em
      // `database.ts` (o gen types vem saindo incompleto), por isso o cast.
      (supabase.rpc.bind(supabase) as unknown as (fn: "is_tester") => PromiseLike<{ data: boolean | null }>)("is_tester"),
    ]);

  // Mapa papel → escopos (dono já vem com todos no seed).
  const scopesByRole: Record<string, string[]> = {};
  for (const r of roleScopes ?? []) (scopesByRole[r.role] ??= []).push(r.scope);

  const companyRoles: Record<string, CompanyRole> = {};
  const companyScopes: Record<string, string[]> = {};
  for (const l of links ?? []) {
    companyRoles[l.company_id] = l.role;
    companyScopes[l.company_id] = scopesByRole[l.role] ?? [];
  }

  return {
    userId: auth.user.id,
    email: auth.user.email ?? null,
    // auth.users.phone vem do Supabase SEM o "+"; recupera pro E.164 canônico (regra única).
    phone: storedPhoneToE164(auth.user.phone),
    role: profile?.role ?? "customer",
    fullName: profile?.full_name ?? null,
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    companyIds: (links ?? []).map((l) => l.company_id),
    companyRoles,
    companyScopes,
    isTester: isTester === true,
  };
}

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function writeStored(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(key, value);
  else window.localStorage.removeItem(key);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [impersonatedCompanyId, setImpersonatedCompanyIdState] = React.useState<string | null>(
    () => readStored(IMPERSONATION_KEY),
  );
  const [storedActiveCompanyId, setStoredActiveCompanyId] = React.useState<string | null>(() =>
    readStored(ACTIVE_COMPANY_KEY),
  );

  const { data: session, isLoading } = useQuery({
    queryKey: ["auth-session"],
    queryFn: loadSession,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: ["auth-session"] });
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  // Impersonation só vale pra hub_admin
  const canImpersonate = session?.role === "hub_admin";
  const effectiveImpersonation = canImpersonate ? impersonatedCompanyId : null;

  const effectiveRole: UserRole | null = !session
    ? null
    : effectiveImpersonation
      ? "company_operator"
      : session.role;

  // Operador em mais de uma empresa (13/10/2026): o painel mostra uma de cada vez.
  const activeCompanyId = resolveActiveCompanyId(
    session?.companyIds ?? [],
    storedActiveCompanyId,
    canImpersonate,
  );

  const effectiveCompanyIds = React.useMemo<string[]>(
    () =>
      !session
        ? []
        : effectiveImpersonation
          ? [effectiveImpersonation]
          : activeCompanyId
            ? [activeCompanyId]
            : session.companyIds,
    [session, effectiveImpersonation, activeCompanyId],
  );

  const scopedCompanyId = effectiveImpersonation ?? activeCompanyId;

  const companyRoleFor = React.useCallback(
    (companyId: string): CompanyRole | null => {
      if (!session) return null;
      // hub_admin (direto ou impersonando) tem acesso total → conta como dono.
      if (session.role === "hub_admin") return "owner";
      return session.companyRoles[companyId] ?? null;
    },
    [session],
  );

  const isCompanyOwner = effectiveCompanyIds.some((id) => companyRoleFor(id) === "owner");

  // Tem ESTE escopo na empresa em escopo ativo? (ADR-005). hub_admin (direto ou impersonando) →
  // sempre true. Sem companyId explícito, usa a empresa em escopo (a ativa, para quem tem mais de uma).
  const hasScope = React.useCallback(
    (scope: string, companyId?: string): boolean => {
      if (!session) return false;
      if (session.role === "hub_admin") return true;
      const id = companyId ?? effectiveCompanyIds[0];
      if (!id) return false;
      return (session.companyScopes[id] ?? []).includes(scope);
    },
    [session, effectiveCompanyIds],
  );

  function setImpersonatedCompanyId(id: string | null) {
    writeStored(IMPERSONATION_KEY, id);
    setImpersonatedCompanyIdState(id);
    // Limpa cache de queries escopadas
    queryClient.invalidateQueries();
  }

  function setActiveCompanyId(id: string | null) {
    writeStored(ACTIVE_COMPANY_KEY, id);
    setStoredActiveCompanyId(id);
    queryClient.invalidateQueries();
  }

  const value = React.useMemo<AuthContextValue>(
    () => ({
      session: session ?? null,
      isLoading,
      impersonatedCompanyId: effectiveImpersonation,
      effectiveRole,
      effectiveCompanyIds,
      scopedCompanyId,
      companyRoleFor,
      isCompanyOwner,
      hasScope,
      switchCompany(companyId) {
        if (!session?.companyIds.includes(companyId)) return;
        setActiveCompanyId(companyId);
      },
      async signInWithGoogle(redirectTo) {
        const callback = `${window.location.origin}/auth/callback${
          redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : ""
        }`;
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: callback,
            queryParams: { prompt: "select_account" },
          },
        });
        if (error) throw error;
      },
      async sendEmailOtp(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true },
        });
        if (error) throw error;
      },
      async verifyEmailOtp(email, token) {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "email",
        });
        if (error) throw error;
        void recordLoginChannel("email");
      },
      async sendWhatsappOtp(phoneE164) {
        const { error } = await supabase.auth.signInWithOtp({
          phone: phoneE164,
          options: {
            shouldCreateUser: true,
            channel: "whatsapp",
          },
        });
        if (error) throw error;
      },
      async verifyPhoneOtp(phoneE164, token) {
        const { error } = await supabase.auth.verifyOtp({
          phone: phoneE164,
          token,
          type: "sms",
        });
        if (error) throw error;
        void recordLoginChannel("whatsapp");
      },
      async signOut() {
        setImpersonatedCompanyId(null);
        setActiveCompanyId(null);
        await supabase.auth.signOut();
        queryClient.clear();
      },
      startImpersonation(companyId) {
        if (!canImpersonate) return;
        setImpersonatedCompanyId(companyId);
      },
      stopImpersonation() {
        setImpersonatedCompanyId(null);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, isLoading, effectiveImpersonation, scopedCompanyId, effectiveRole, canImpersonate, companyRoleFor, isCompanyOwner, hasScope],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
