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

## Aviso da janela de estorno (17/09/2026)

A Pagar.me só estorna pela API dentro de um prazo contado do pagamento: **PIX 90 dias, cartão
180**. Passou, recusa com ou sem saldo, e o cancelamento cai na fila de reembolso manual. O modal
da reserva no Manager avisa antes do clique: vencida, um bloco em vermelho com a data e a
consequência; a vencer em até 7 dias, um bloco de atenção com a data. Lógica pura em
`payment.logic.ts` (`refundWindow`, `REFUND_WINDOW_DAYS`), com o embed de `payments` da reserva
trazendo `paid_at` e `method`.

## Rastro do checkout no navegador (06/10/2026)

O rastro só via o que a Edge mandou à Pagar.me. Duas falhas de cartão ficavam de fora, e foi assim
que o cartão passou de 23/09 a 05/10 sem vender: as 14 tentativas que morreram em 409 na trava de
recebedor e as duas recusadas por falta de telefone (412) só apareciam no log da Edge.

- **Recusa da Edge antes do gateway.** No `create-card-charge`, toda recusa depois de achar a
  reserva passa por `recusar()` e grava `charge_rejected`, com o HTTP, a mensagem devolvida ao
  cliente e, no 502 do gateway, a resposta crua. Guarda: `rejection-trail.contract.test.ts`.
- **O que acontece no navegador.** A tokenização vai direto do navegador à Pagar.me e nunca passava
  pelo backend. O checkout grava `client:*` pela RPC `log_checkout_event` (security definer, só o
  dono da reserva, kind por allowlist, teto de 60 por reserva):
  `client:card_attempt` no clique, `client:card_validation` (validade, endereço, documento),
  `client:card_tokenize_failed` (HTTP da Pagar.me, `0` quando a chamada nem saiu por rede,
  bloqueador ou CORS, mais a mensagem e os NOMES dos campos recusados),
  `client:card_charge_failed` (HTTP e mensagem da Edge), `client:card_charge_ok` e
  `client:pix_failed`. Nunca entra dado de cartão: só bandeira, parcelas e se é cartão salvo.
- **Antifraude.** A reprovação aparece como `charge_failed` com a nota "reprovado pelo antifraude",
  e o navegador grava o `client:card_charge_failed` com HTTP 402 e `code` na mensagem.

Leitura do funil (só hub_admin, view `checkout_card_funnel` com `security_invoker`):

```sql
select booking_code, created_at, kind, http_status, note
from checkout_card_funnel
where created_at > now() - interval '7 days'
order by booking_code, created_at;
```

Testes: pgTAP `log_checkout_event.test.sql` (8), Vitest `checkoutTrail.test.ts` e
`pagarme-tokenize.test.ts`.
