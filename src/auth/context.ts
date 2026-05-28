import * as React from "react";
import type { Session, UserRole } from "@/types/domain";

export type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  /** Empresa que o hub_admin está impersonando, ou null. */
  impersonatedCompanyId: string | null;
  /** Papel "efetivo" pra fins de UI/rota — fica company_operator se houver impersonation. */
  effectiveRole: UserRole | null;
  /** IDs das empresas em escopo ativo (próprio operador ou alvo da impersonation). */
  effectiveCompanyIds: string[];
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  startImpersonation: (companyId: string) => void;
  stopImpersonation: () => void;
};

export const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
