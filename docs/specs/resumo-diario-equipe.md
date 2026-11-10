# Resumo diário da equipe Movepark

**Status:** no ar desde 10/11/2026 (primeiro envio em 11/11/2026, às 7h). Pedido do Kallef, que
quis um e-mail diário "com tudo que aconteceu no dia anterior". O parceiro já tinha o dele
([resumo-diario-parceiro.md](./resumo-diario-parceiro.md)); a equipe Movepark não tinha nenhum.

## O que é

Um e-mail às **7h de Brasília** com o **dia anterior inteiro** (0h às 24h de Brasília). Os números
de venda, clientes e cancelamento vêm comparados com o mesmo dia da semana anterior.

| Bloco | Conteúdo |
|---|---|
| Vendas | reservas e valor vendido no Hub, comissão da Movepark, cartão e PIX, reservas e valor do white-label |
| Canais do Hub | reservas e valor por canal (`commission_channel`, senão `utm_source`, senão "Sem canal"; `hub` aparece como "Movepark") |
| Clientes | cadastros novos, quem comprou pela primeira vez e quem voltou a comprar |
| Dinheiro | repasses do dia por empresa (automático ou saque pedido), cancelamentos, estornado, dívida de parceiros em aberto |
| Hoje | entradas e saídas do Hub no dia do e-mail, chamados abertos e novos |
| Avaliações | quantas, a média e as de nota até 3 com o comentário |
| Atenção | publicação do site parada (`site_rebuild_health`), entrega de integração que falhou, cartão recusado no checkout, lead de parceiro novo. Sem nada: "Nada pedindo atenção." |

## Regras dos números

- **Venda do Hub:** pagamento de reserva (`kind = booking`) com `paid_at` no dia e status `paid` ou
  `refunded` (o estorno posterior não apaga a venda daquele dia; ele aparece em "Estornado" no dia em
  que aconteceu). `payment.amount` é em reais; o resumo trabalha em centavos.
- **Comissão:** soma das pernas que não são do parceiro no `payment.split`
  (`split_rule_is_partner`), antes da taxa da Pagar.me.
- **White-label:** `wl_booking` criado no dia, `status = confirmed`, sem duplicata.
- **Cadastro novo:** `profiles` com papel `customer` criado no dia.
- **Primeira compra:** a conta não tinha pagamento de reserva antes do dia.
- **Cancelamento:** `booking_modification` do tipo `cancel` no dia.
- **Dívida:** soma de `payout_debt_cents` por recebedor, só o que é positivo (crédito de um parceiro
  não abate dívida de outro).

## Quem recebe

A lista `app_setting.team_daily_digest_recipients` (e-mails separados por vírgula), editável sem
deploy. Começou com `contato@movepark.co`, a caixa que a equipe já lê para leads e suporte: o único
`hub_admin` cadastrado em 10/11/2026 era a conta de teste `developer@fera.ag`.

## Peças

| Peça | O quê |
|---|---|
| `team_digest_numbers(p_day)` | os números comparáveis de um dia (só service role) |
| `team_daily_digest(p_day)` | o resumo inteiro em jsonb, com o dia e 7 dias antes (só service role) |
| `team_digest_log` | uma linha por dia: idempotência da segunda passada. hub_admin lê |
| Edge `team-daily-digest` | monta e manda; `{ dry_run: true }` devolve assunto e HTML sem mandar; `{ day }` para rodar à mão |
| `tplTeamDailyDigest` | o modelo, em `_shared/email.ts` (ADR-007) |
| cron `team-daily-digest` | `0,30 10 * * *` UTC: 7h e 7h30 de Brasília (a segunda só manda se a primeira falhou) |
| `app_setting.team_daily_digest_enabled` | chave geral (`true`/`false`) |
| Vault `team_digest_key` | chave do header `x-team-digest-key` |

Falha de envio para todos apaga a linha do log e a passada das 7h30 tenta de novo.

Migration `20261201235000_resumo_diario_equipe.sql`. Testes: `supabase/tests/team_daily_digest.test.sql`
(18, roda também contra o banco vivo porque usa um dia de 2030), `team-daily-digest/logic.test.ts`
e os casos `tplTeamDailyDigest`/`teamDigestDelta` em `_shared/email.test.ts`.
