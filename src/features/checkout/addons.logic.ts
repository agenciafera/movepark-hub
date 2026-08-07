// Lógica pura do passo de adicionais.

/**
 * Como o carro aparece no título ("Quer algum cuidado extra com o Ford Fiesta?").
 *
 * Sem modelo, cai pra "seu carro". A placa existe sempre, mas num título ela soa
 * a cadastro, não a conversa, e o cliente acabou de escolher o veículo no passo
 * anterior: ele sabe de qual carro estamos falando.
 */
export function carroDoTitulo(model: string | null | undefined): string {
  const limpo = model?.trim();
  return limpo ? limpo : "seu carro";
}
