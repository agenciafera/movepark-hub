import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Session, UserRole } from "@/types/domain";
import { AuthContext, type AuthContextValue } from "./context";

const IMPERSONATION_KEY = "mp:impersonated-company-id";

async function loadSession(): Promise<Session | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: profile }, { data: links }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", auth.user.id)
      .maybeSingle(),
    supabase.from("profile_company").select("company_id").eq("profile_id", auth.user.id),
  ]);

  return {
    userId: auth.user.id,
    email: auth.user.email ?? null,
    role: profile?.role ?? "customer",
    fullName: profile?.full_name ?? null,
    companyIds: (links ?? []).map((l) => l.company_id),
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
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
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
    [session, isLoading, effectiveImpersonation, effectiveRole, canImpersonate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
