/**
 * Fixture de teste do roteiro E1.3 (task ClickUp 86ajkdr1d).
 *
 * Estas constantes são o ÚNICO escopo que a limpeza da suíte pode tocar.
 * Ver a guarda em `db.ts` (`assertFixtureScoped`) antes de mexer aqui.
 */

/** E-mail de contato da fixture. Também é o login do operador de teste. */
export const FIXTURE_EMAIL = "peu+mercy@fera.ag";

/** Telefone da fixture, em E.164. */
export const FIXTURE_PHONE = "+55 11 98772 7182";

/** Nome da empresa fictícia. */
export const FIXTURE_COMPANY_NAME = "Mercy";

/**
 * Padrão de slug usado nos deletes. Deliberadamente específico: qualquer
 * alargamento aqui (ex.: trocar por '%') é barrado por `assertFixtureScoped`.
 */
export const FIXTURE_SLUG_PATTERN = "%mercy%";

/**
 * Teto de segurança: se o padrão casar com mais empresas que isso, a limpeza
 * aborta em vez de apagar. Protege o banco de produção de um padrão largo.
 */
export const MAX_FIXTURE_COMPANIES = 3;
