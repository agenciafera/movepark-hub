# Rastro do gateway: o que a Pagar.me devolveu, visível na reserva

**Épico:** E0.3.9. **Estado:** implementado em 17/09/2026 (migration `20261120070000`).
**Pedido do Kallef:** o Manager precisa ver sempre os dados de retorno das APIs da Pagar.me nas
reservas e nas ações: order e charge da cobrança, a resposta do estorno, os webhooks.

## O que fica gravado

Tabela `payment_gateway_event` (payment, reserva, `kind`, HTTP, `request`, `response`, `note`,
`created_at`). Quem escreve são as Edges, best-effort (`_shared/payments/trail.ts`): o rastro
nunca derruba a ação. Só hub_admin lê (RLS e RPC).

| kind | Quem grava | request | response |
|---|---|---|---|
| `charge_created` | create-pix-charge, create-card-charge | método, valor, parcelas, split enviado, validade | a order da Pagar.me (com charges, ids, status, QR) |
| `charge_failed` | create-card-charge | método, valor, parcelas | a recusa do emissor |
| `refund` | cancel-booking, delete-account, reconcile-confirmations, pagarme-webhook (pago sem vaga), change-booking-dates-paid | valor, regras enviadas, modo (partner, master, none) e o motivo da decisão do híbrido | a resposta do `DELETE /charges/{id}` |
| `webhook:<tipo>` | pagarme-webhook | nada | o evento inteiro, como chegou |

O cartão nunca entra no rastro: o pedido registra só ids, valor, parcelas e split.

## Onde aparece

Manager › Reservas › clique na reserva › bloco **Gateway (Pagar.me)** (só hub_admin), pela RPC
`booking_gateway_trail(booking)`:

- por pagamento: método, valor, status, **order** e **charge** copiáveis, datas de criação,
  pagamento e expiração, taxa do gateway apurada, data de liberação da parte do parceiro, o
  split como foi (parceiro, Movepark, `liable`, abatimento de dívida) e, se houve, o estorno com
  valor, motivo e quem pagou (gateway debitou o parceiro, ou 100% do master);
- a lista de chamadas, da mais nova para a mais velha, com HTTP e hora; cada uma abre o pedido e
  a resposta crua em JSON.

## Testes

pgTAP `payment_gateway_event.test.sql` (7): RLS e RPC só para hub_admin, ids do gateway na
resposta, ordem dos eventos. Deno `trail.test.ts`. Vitest `GatewayTrail.test.tsx` (ids, split,
estorno, evento expansível) e o modal da reserva.
