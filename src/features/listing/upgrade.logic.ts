/**
 * Indução de upgrade de tipo de vaga na página da unidade (E2.1.4, decisão da reunião de 21/07).
 *
 * Quem entrou pelo tipo mais barato é induzido a subir ("por mais R$X, cubra seu carro"); quem já
 * está no topo não vê nada. É SÓ upgrade, nunca downgrade (regra de produto, registrada como escolha
 * consciente). A troca é pré-pagamento: o cliente ainda não reservou, então o link só leva ao outro
 * tipo, sem mexer em reserva nem capacidade.
 */
export type TypePrice = {
  code: string;
  name: string;
  /** Preço simulado para a duração atual; null quando não deu pra simular. */
  price: number | null;
};

export type UpgradeTarget = {
  code: string;
  name: string;
  /** Quanto a mais que o tipo atual, na mesma duração. Sempre > 0. */
  delta: number;
};

/**
 * Escolhe o alvo de upgrade: o tipo MAIS BARATO entre os que custam mais que o atual. Sem candidato
 * mais caro (o cliente já está no tipo mais premium), devolve null e nenhum nudge aparece.
 * O menor salto primeiro é o mais convertível ("por mais R$6" converte melhor que "por mais R$28").
 */
export function pickUpgradeTarget(
  currentCode: string,
  types: TypePrice[],
): UpgradeTarget | null {
  const current = types.find((t) => t.code === currentCode);
  if (!current || current.price == null) return null;

  const upgrades = types
    .filter((t) => t.code !== currentCode && t.price != null && t.price > current.price!)
    .sort((a, b) => a.price! - b.price!);

  const target = upgrades[0];
  if (!target) return null;

  return {
    code: target.code,
    name: target.name,
    delta: Math.round((target.price! - current.price!) * 100) / 100,
  };
}
