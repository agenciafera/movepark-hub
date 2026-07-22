import * as React from "react";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router-dom";
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
     * Padrão da rota, para componente que lê `useParams()`. Com ele, a árvore
     * usa um DATA ROUTER (`createMemoryRouter`), não o `<MemoryRouter>` simples:
     * `useParams()` resolve o id E hooks de data router como `useBlocker`
     * funcionam, igual à produção (vite-react-ssg usa `createBrowserRouter`).
     * Sem `path`, mantém o MemoryRouter simples dos testes que não precisam disso.
     */
    path?: string;
  },
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const future = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

  const tree = opts?.path ? (
    <RouterProvider
      router={createMemoryRouter([{ path: opts.path, element: ui }], {
        initialEntries: [opts?.route ?? "/"],
        future,
      })}
    />
  ) : (
    <MemoryRouter initialEntries={[opts?.route ?? "/"]} future={future}>
      {ui}
    </MemoryRouter>
  );

  return render(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={opts?.auth ?? mockAuth()}>{tree}</AuthContext.Provider>
    </QueryClientProvider>,
  );
}
