import {
  carUnits,
  listingPath,
  priceFor,
  unitLabel,
  type PriceDestination,
} from "./priceIndex.logic";

/**
 * Lógica pura da página /estacionamento-mais-barato/<slug>.
 *
 * A página responde "qual o mais barato" com vencedor e segunda opção por
 * duração, direto da matriz do motor (a mesma de /precos). Fica separada do
 * priceIndex.logic porque é outra intenção de busca com outra página; os
 * helpers de base são importados de lá.
 */

export type MaisBaratoOpcao = {
  label: string;
  parkingTypeName: string;
  total: number;
  perDay: number;
  path: string;
};

export type MaisBaratoLinha = {
  days: number;
  vencedor: MaisBaratoOpcao;
  vice: MaisBaratoOpcao | null;
};

/**
 * Vencedor e vice por duração, só carros, empate resolvido por ordem estável.
 * Duração sem nenhum preço não gera linha (estadia mínima pode esvaziar 1 diária).
 */
export function maisBaratoPorDuracao(dest: PriceDestination, days: number[]): MaisBaratoLinha[] {
  const units = carUnits(dest.units);
  const linhas: MaisBaratoLinha[] = [];

  for (const d of days) {
    const precificadas = units
      .map((u) => ({ u, total: priceFor(u, d)?.total ?? null }))
      .filter((x): x is { u: (typeof units)[number]; total: number } => x.total != null)
      .sort((a, b) => a.total - b.total);

    if (precificadas.length === 0) continue;

    const toOpcao = (x: { u: (typeof units)[number]; total: number }): MaisBaratoOpcao => ({
      label: unitLabel(x.u, units),
      parkingTypeName: x.u.parking_type_name,
      total: x.total,
      perDay: x.total / d,
      path: listingPath(x.u),
    });

    linhas.push({
      days: d,
      vencedor: toOpcao(precificadas[0]),
      vice: precificadas[1] ? toOpcao(precificadas[1]) : null,
    });
  }

  return linhas;
}

/** "agosto/2026", para o title e o texto carimbarem o frescor do dado. */
export function mesAnoAtual(agora: Date = new Date()): string {
  const mes = agora.toLocaleDateString("pt-BR", { month: "long" });
  return `${mes}/${agora.getFullYear()}`;
}
