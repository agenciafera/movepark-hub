import * as React from "react";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "@/auth/context";
import type { AuthContextValue } from "@/auth/context";
import type { Session, UserRole } from "@/types/domain";

/** Sessão fake para testes. */
export function mockSession(role: UserRole, overrides?: Partial<Session>): Session {
  return {
    userId: "user-test",
    email: "test@example.com",
    phone: null,
    role,
    fullName: "Teste",
    firstName: "Teste",
    lastName: null,
    companyIds: role === "company_operator" ? ["company-1"] : [],
    companyRoles: role === "company_operator" ? { "company-1": "owner" } : {},
    companyScopes: {},
    ...overrides,
  };
}

/** AuthContextValue fake — métodos são no-ops; sobrescreva o que importar. */
export function mockAuth(overrides?: Partial<AuthContextValue>): AuthContextValue {
  return {
    session: null,
    isLoading: false,
    impersonatedCompanyId: null,
    effectiveRole: null,
    effectiveCompanyIds: [],
    companyRoleFor: () => null,
    isCompanyOwner: false,
    // Default permissivo: o contexto fake autoriza tudo; testes de permissão sobrescrevem.
    hasScope: () => true,
    signInWithGoogle: vi.fn(),
    sendEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    sendWhatsappOtp: vi.fn(),
    verifyPhoneOtp: vi.fn(),
    signOut: vi.fn(),
    startImpersonation: vi.fn(),
    stopImpersonation: vi.fn(),
    ...overrides,
  };
}

export function renderWithProviders(
  ui: React.ReactNode,
  opts?: {
    auth?: AuthContextValue;
    route?: string;
    /**
     * Padrão da rota, para componente que lê `useParams()`. Sem ele o
     * MemoryRouter monta a árvore sem `<Routes>`, e `useParams()` devolve `{}`:
     * a página renderiza como se o id não existisse.
     */
    path?: string;
  },
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={opts?.auth ?? mockAuth()}>
        <MemoryRouter
          initialEntries={[opts?.route ?? "/"]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          {opts?.path ? (
            <Routes>
              <Route path={opts.path} element={ui} />
            </Routes>
          ) : (
            ui
          )}
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
