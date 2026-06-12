/**
 * Unidades federativas do Brasil (27 — 26 estados + Distrito Federal).
 *
 * `uf` é o código de 2 letras maiúsculas armazenado no banco (coluna `state` de
 * address/destination/company_onboarding) e retornado pelo ViaCEP. `name` é o
 * rótulo de exibição. Lista ordenada alfabeticamente por nome para leitura/typeahead.
 *
 * Fonte de verdade para o componente `StateSelect`; não duplique esta lista.
 */
export type BrazilianState = { uf: string; name: string };

export const BRAZILIAN_STATES: readonly BrazilianState[] = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
] as const;

/** Conjunto de códigos válidos, para validação rápida. */
export const BRAZILIAN_UFS: readonly string[] = BRAZILIAN_STATES.map((s) => s.uf);

/** Normaliza e valida uma UF (aceita minúsculas/espaços). Retorna `null` se inválida. */
export function normalizeUf(value: string | null | undefined): string | null {
  if (!value) return null;
  const uf = value.trim().toUpperCase();
  return BRAZILIAN_UFS.includes(uf) ? uf : null;
}
