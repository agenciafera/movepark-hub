import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { storedPhoneToE164 } from "@/lib/identifiers";
import type { CompanyRole, Session, UserRole } from "@/types/domain";
import { AuthContext, type AuthContextValue } from "./context";

const IMPERSONATION_KEY = "mp:impersonated-company-id";

async function loadSession(): Promise<Session | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: profile }, { data: links }, { data: roleScopes }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name, role")
      .eq("id", auth.user.id)
      .maybeSingle(),
    supabase.from("profile_company").select("company_id, role").eq("profile_id", auth.user.id),
    // Presets fixos papel→escopo (ADR-005). Tabela pequena, leitura pública p/ authenticated.
    supabase.from("company_role_scope").select("role, scope"),
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
  };
}

function readStoredImpersonation(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(IMPERSONATION_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [impersonatedCompanyId, setImpersonatedCompanyIdState] = React.useState<string | null>(
    readStoredImpersonation,
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

  const effectiveCompanyIds: string[] = !session
    ? []
    : effectiveImpersonation
      ? [effectiveImpersonation]
      : session.companyIds;

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
  // sempre true. Sem companyId explícito, usa a primeira empresa efetiva.
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
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(IMPERSONATION_KEY, id);
      else window.localStorage.removeItem(IMPERSONATION_KEY);
    }
    setImpersonatedCompanyIdState(id);
    // Limpa cache de queries escopadas
    queryClient.invalidateQueries();
  }

  const value = React.useMemo<AuthContextValue>(
    () => ({
      session: session ?? null,
      isLoading,
      impersonatedCompanyId: effectiveImpersonation,
      effectiveRole,
      effectiveCompanyIds,
      companyRoleFor,
      isCompanyOwner,
      hasScope,
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
      },
      async signOut() {
        setImpersonatedCompanyId(null);
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
    [session, isLoading, effectiveImpersonation, effectiveRole, canImpersonate, companyRoleFor, isCompanyOwner, hasScope],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
