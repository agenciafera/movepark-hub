import { useAuth } from "@/auth/context";

/**
 * A pessoa lê o dinheiro das reservas da empresa em escopo? (`finance:read`: Dono, Gerente e
 * Financeiro; hub_admin sempre.) Quem não lê é o balcão (papel Operação).
 *
 * É o espelho de uma regra do servidor, não a barreira: as policies de `booking` e `payment` só
 * deixam o membro ler valores com `finance:read` (docs/specs/permissions.md, "Dinheiro da
 * reserva"). Sem o escopo, a leitura da reserva passa pelas RPCs do balcão (`operator_*`), que
 * nunca devolvem valor, e a tela esconde o que seria zero.
 */
export function useSeesMoney(): boolean {
  const { hasScope, effectiveCompanyIds } = useAuth();
  return hasScope("finance:read", effectiveCompanyIds[0]);
}
