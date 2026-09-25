import * as React from "react";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { render } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import type { LoaderFunction } from "react-router-dom";
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
    isTester: false,
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
    /**
     * Loader da rota, para testar página de SSG. Em produção o `vite-react-ssg` troca o loader
     * do cliente por um fetch do JSON do build, indexado por PATHNAME: ele devolve sempre o
     * mesmo dado, sem a query string. Um loader constante aqui reproduz isso.
     */
    loader?: LoaderFunction;
  },
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const future = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

  /*
    SEMPRE data router, com ou sem `path`.

    Antes, teste sem `path` caía num `<MemoryRouter>` simples, que não é o que a produção
    usa (o vite-react-ssg monta `createBrowserRouter`). A diferença ficou invisível até o
    rodapé passar a ler a rota por `useMatches`, que só existe em data router: três
    arquivos de teste sem relação com a mudança quebraram de uma vez, com uma mensagem
    sobre roteador que não explicava nada sobre o que tinha mudado.

    Testar numa árvore que a aplicação não tem só adia a descoberta. O `path` continua
    servindo para quem precisa de `useParams()`; sem ele, a rota casa tudo.
  */
  const tree = (
    <RouterProvider
      router={createMemoryRouter([{ path: opts?.path ?? "*", element: ui, loader: opts?.loader }], {
        initialEntries: [opts?.route ?? "/"],
        future,
      })}
    />
  );

  // O HelmetProvider vem do `vite-react-ssg` na app real, não do nosso código, então
  // componente com <Helmet> renderiza em produção mas quebra em teste isolado
  // ("Cannot read properties of undefined"). Entra aqui para o teste refletir a árvore
  // de verdade, e não para contornar o erro.
  return render(
    <HelmetProvider>
      <QueryClientProvider client={qc}>
        <AuthContext.Provider value={opts?.auth ?? mockAuth()}>{tree}</AuthContext.Provider>
      </QueryClientProvider>
    </HelmetProvider>,
  );
}
