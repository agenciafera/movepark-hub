import * as React from "react";
import type { CompanyRole, Session, UserRole } from "@/types/domain";

export type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  /** Empresa que o hub_admin está impersonando, ou null. */
  impersonatedCompanyId: string | null;
  /** Papel "efetivo" pra fins de UI/rota — fica company_operator se houver impersonation. */
  effectiveRole: UserRole | null;
  /** IDs das empresas em escopo ativo (próprio operador ou alvo da impersonation). */
  effectiveCompanyIds: string[];
  /**
   * Papel do usuário DENTRO de uma empresa (E1.6). hub_admin e impersonation
   * contam como `owner` (acesso total). `null` se não for membro.
   */
  companyRoleFor: (companyId: string) => CompanyRole | null;
  /** Atalho: é dono da empresa em escopo ativo? (governa gestão de usuários etc.) */
  isCompanyOwner: boolean;
  /**
   * Tem o ESCOPO na empresa em escopo ativo (ADR-005)? hub_admin → sempre true.
   * `companyId` opcional; sem ele, usa a primeira empresa efetiva. É o gate único de
   * permissão no front (rotas via RequireScope, seções e ações).
   */
  hasScope: (scope: string, companyId?: string) => boolean;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  /** Dispara OTP por e-mail (cria conta se primeiro acesso). */
  sendEmailOtp: (email: string) => Promise<void>;
  /** Verifica OTP de e-mail e cria sessão. */
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  /** Dispara OTP por WhatsApp (cria conta se primeiro acesso). */
  sendWhatsappOtp: (phoneE164: string) => Promise<void>;
  /** Verifica OTP de telefone e cria sessão. */
  verifyPhoneOtp: (phoneE164: string, token: string) => Promise<void>;
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
