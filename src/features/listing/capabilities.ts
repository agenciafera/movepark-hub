/**
 * Capacidades da unidade (E0.15 · ADR-009).
 *
 * Nenhum bloco que prometa condição de transação renderiza incondicionalmente. Todos leem
 * daqui, e a fonte primária é `location.checkout_mode`: quando a reserva fecha no white-label
 * do parceiro, quem cumpre cancelamento, cupom e vaga garantida é ele, não a Movepark.
 *
 * **Este tipo é a lista canônica de promessas.** Bloco novo na single obriga a declarar a
 * capacidade dele aqui, senão não compila no consumo. Fato da unidade (endereço, fotos,
 * amenidades, shuttle, distância) NÃO entra nesta lista: descreve o lugar e é verdade
 * independente de onde a reserva fecha.
 *
 * Asterisco ou nota de rodapé que contradiga bloco visível é proibido. Se a unidade não
 * entrega, o bloco não existe.
 */
export type LocationCapabilities = {
  /** Vender Tarifa (Básica/Flex/Superflex) e mostrar o comparativo. */
  fares: boolean;
  /** Prometer cancelamento com reembolso. */
  cancellation: boolean;
  /** Prometer alteração de datas. */
  dateChange: boolean;
  /** Aceitar cupom de desconto. */
  coupons: boolean;
  /** Vender serviços extras da unidade. */
  addOns: boolean;
  /** Exibir avaliações e nota. */
  reviews: boolean;
  /** Prometer vaga garantida (depende de o Hub controlar a disponibilidade). */
  guaranteedSpot: boolean;
  /** Responder a FAQ global da Movepark, além da FAQ da própria unidade. */
  globalFaq: boolean;
  /** Fechar a reserva no checkout do Hub. */
  hubCheckout: boolean;
};

/** O mínimo que a função precisa saber da unidade. */
export type CapabilitySource = { checkout_mode?: string | null };

const TUDO: LocationCapabilities = {
  fares: true,
  cancellation: true,
  dateChange: true,
  coupons: true,
  addOns: true,
  reviews: true,
  guaranteedSpot: true,
  globalFaq: true,
  hubCheckout: true,
};

const NADA: LocationCapabilities = {
  fares: false,
  cancellation: false,
  dateChange: false,
  coupons: false,
  addOns: false,
  reviews: false,
  guaranteedSpot: false,
  globalFaq: false,
  hubCheckout: false,
};

/**
 * Capacidades da unidade. `checkout_mode = 'external'` derruba o conjunto de uma vez.
 *
 * O default é permissivo de propósito: `checkout_mode` nasceu com default `'hub'` no banco e
 * a esmagadora maioria das unidades é própria. Ler ausência de valor como "sem capacidade"
 * apagaria a página de toda unidade nativa no primeiro erro de select.
 */
export function getLocationCapabilities(location: CapabilitySource | null | undefined): LocationCapabilities {
  return location?.checkout_mode === "external" ? { ...NADA } : { ...TUDO };
}

/** A unidade fecha a reserva fora do Hub. Açúcar para leitura. */
export function isExternalCheckout(location: CapabilitySource | null | undefined): boolean {
  return !getLocationCapabilities(location).hubCheckout;
}
