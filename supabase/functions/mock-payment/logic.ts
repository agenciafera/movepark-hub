/**
 * Guarda de ambiente do `mock-payment`.
 *
 * A função confirma uma reserva sem cobrar nada. Isso é aceitável num ambiente de
 * teste e é uma porta de estacionamento grátis em produção: qualquer pessoa logada
 * cria uma reserva de verdade, chama esta rota com o próprio JWT e sai com voucher
 * válido para apresentar na portaria do parceiro.
 *
 * O caminho de pagamento do produto é o Pagar.me (`create-pix-charge`,
 * `create-card-charge`). Esta função ficou órfã: nenhuma tela chama, e o próprio
 * spec `C09-pix-qrcode.spec.ts` já registra isso. Mesmo assim ela seguia ATIVA no
 * projeto, aceitando chamada.
 *
 * Por isso a guarda falha fechada: sem `MOCK_PAYMENT_ENABLED=true` explícito, a
 * função recusa. Ligar de volta é uma variável de ambiente, sem deploy.
 */

export type GuardaDecisao =
  | { permitido: true }
  | { permitido: false; status: number; erro: string };

/** Só a string exata "true" liga. "1", "yes" e vazio continuam desligados. */
export function avaliarGuardaAmbiente(valor: string | undefined): GuardaDecisao {
  if (valor === "true") return { permitido: true };
  return {
    permitido: false,
    status: 404,
    erro: "Not found",
  };
}
