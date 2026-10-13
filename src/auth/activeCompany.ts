/**
 * Empresa ativa do operador que é membro de mais de uma (13/10/2026).
 *
 * O painel do parceiro mostra uma empresa de cada vez. Sem isso, as listas juntavam as duas
 * enquanto o nome no menu e as permissões seguiam só uma delas, sem ordem definida.
 *
 * - Uma empresa só, ou nenhuma: `null`, porque não há o que escolher e a RLS já recorta.
 * - hub_admin: `null`. Ele troca de conta por impersonation, que é outro mecanismo.
 * - A guardada no aparelho, se o vínculo com ela ainda existe.
 * - Senão, a primeira da lista, que vem na ordem do vínculo.
 */
export function resolveActiveCompanyId(
  companyIds: string[],
  stored: string | null,
  isHubAdmin: boolean,
): string | null {
  if (isHubAdmin || companyIds.length < 2) return null;
  return stored && companyIds.includes(stored) ? stored : companyIds[0];
}
