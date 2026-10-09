/**
 * Quem "tem white-label" (reservas-unificadas-hub-wl.md § 2): a empresa tem `wl_domain`
 * preenchido. É a mesma regra de `company_has_wl` no banco.
 *
 * Quem não tem não vê nada do white-label: nem etiqueta, nem filtro, nem coluna, nem texto. Para
 * esse estacionamento é como se o white-label nunca tivesse existido.
 */
export function companyHasWl(company: { wl_domain?: string | null } | null | undefined): boolean {
  return !!company?.wl_domain && company.wl_domain.trim() !== "";
}

/** O painel mostra o white-label quando alguma das empresas em foco tem site. */
export function anyCompanyHasWl(companies: { wl_domain?: string | null }[] | null | undefined): boolean {
  return (companies ?? []).some(companyHasWl);
}
