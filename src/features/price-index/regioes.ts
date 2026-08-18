/**
 * Agrupamento de destino por região do Brasil, para a lista "Aeroportos e
 * destinos atendidos" da calculadora.
 *
 * A `destination` guarda a UF, não a região, porque UF é o dado que o cadastro
 * tem e região é derivação. Fica aqui, puro e testável, em vez de virar uma
 * coluna que alguém teria que manter em dia.
 */

export const REGIOES = [
  "Sudeste",
  "Sul",
  "Nordeste",
  "Centro-Oeste",
  "Norte",
  "Outros destinos",
] as const;

export type Regiao = (typeof REGIOES)[number];

const UF_REGIAO: Record<string, Regiao> = {
  ES: "Sudeste",
  MG: "Sudeste",
  RJ: "Sudeste",
  SP: "Sudeste",
  PR: "Sul",
  RS: "Sul",
  SC: "Sul",
  AL: "Nordeste",
  BA: "Nordeste",
  CE: "Nordeste",
  MA: "Nordeste",
  PB: "Nordeste",
  PE: "Nordeste",
  PI: "Nordeste",
  RN: "Nordeste",
  SE: "Nordeste",
  DF: "Centro-Oeste",
  GO: "Centro-Oeste",
  MT: "Centro-Oeste",
  MS: "Centro-Oeste",
  AC: "Norte",
  AP: "Norte",
  AM: "Norte",
  PA: "Norte",
  RO: "Norte",
  RR: "Norte",
  TO: "Norte",
};

/** UF sem correspondência (ou vazia) cai em "Outros destinos", nunca some da lista. */
export function regiaoDaUf(uf: string | null | undefined): Regiao {
  if (!uf) return "Outros destinos";
  return UF_REGIAO[uf.trim().toUpperCase()] ?? "Outros destinos";
}

export type ComUf = { state?: string | null };

export type GrupoRegiao<T> = { regiao: Regiao; itens: T[] };

/**
 * Agrupa na ordem de `REGIOES` e descarta região vazia. A ordem de entrada é
 * preservada dentro de cada grupo, então o `sort_order` do cadastro continua
 * mandando em quem aparece primeiro.
 */
export function agruparPorRegiao<T extends ComUf>(itens: T[]): GrupoRegiao<T>[] {
  const mapa = new Map<Regiao, T[]>();
  for (const item of itens) {
    const r = regiaoDaUf(item.state);
    const lista = mapa.get(r);
    if (lista) lista.push(item);
    else mapa.set(r, [item]);
  }
  return REGIOES.filter((r) => mapa.has(r)).map((regiao) => ({ regiao, itens: mapa.get(regiao)! }));
}
