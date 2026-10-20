# Resumo diário do parceiro

**Status:** no ar desde 20/10/2026. Pedido do Kallef, que mudou a decisão de 23/09/2026 ("o
parceiro não recebe aviso de reserva nova, só vê no Operator").

## Por quê

Em 19/10/2026 nenhum usuário da Abbapark nem da Nationpark abria o Operator desde 30/09, e
nenhuma das 36 reservas vendidas pelo Hub tinha check-in registrado. O white-label recebe só a
contagem de vagas (`wl_delivery reserve`, sem nome nem placa). O parceiro só descobria o cliente
do Hub no portão, pelo voucher.

## O que é

Um e-mail por empresa por dia, às **6h de Brasília**, **só quando há movimento**:

- **Entram hoje:** hora local da entrada, cliente, placa, veículo, tipo de vaga, passageiros,
  PCD, voo, Superflex com proteção de voo, adicionais, saída prevista e código.
- **Saem hoje:** hora da saída, cliente, placa e quando entrou.
- **Reservas novas:** pagas desde o resumo anterior enviado à empresa (sem resumo anterior, desde
  as 6h do dia anterior), para datas futuras. Reserva que entra ou sai hoje aparece só nas listas
  de cima.

Só reservas do Hub (`booking`), em status `confirmed`, `checked_in` ou `completed` (entrada exige
`confirmed`/`checked_in`). Datas comparadas no fuso de cada unidade. Empresa externa com reserva
antiga do Hub (BePark, MP-670EDA) também recebe no dia da entrada.

## Quem recebe

A equipe da empresa com o escopo `bookings:read` (ADR-005; hoje os quatro papéis) e o dono,
pelos e-mails da conta (`partner_digest_recipients`). Sem ninguém na equipe, o contato da
empresa (`partnerContact`: e-mail do KYC, senão o do onboarding). Usuário banido fica fora.
Empresa silenciosa (`hub_relationship = silent`) não recebe (`sendPartnerEmail`).

## Peças

| Peça | O quê |
|---|---|
| `partner_daily_digest(p_day)` | o movimento do dia por empresa (só service role) |
| `partner_digest_recipients(company)` | e-mails da equipe com `bookings:read` (só service role) |
| `partner_digest_log` | uma linha por empresa por dia: idempotência e o "desde quando" das novas. hub_admin lê |
| Edge `partner-daily-digest` | monta e manda; `{ dry_run: true }` monta sem mandar; `{ day, company_id }` para rodar à mão |
| `tplPartnerDailyDigest` | o modelo, em `_shared/email.ts` (ADR-007) |
| cron `partner-daily-digest` | `0,30 9 * * *` UTC: 6h e 6h30 de Brasília (a segunda passada só pega quem falhou) |
| `app_setting.partner_daily_digest_enabled` | chave geral (`true`/`false`) |
| Vault `partner_digest_key` | chave do header `x-partner-digest-key` |

Falha de envio apaga a linha do log e a passada das 6h30 tenta de novo. Envio feito ou empresa
silenciosa mantém a linha, e o dia não repete.

Migration `20261130170000_resumo_diario_parceiro.sql`. Testes: `supabase/tests/partner_daily_digest.test.sql`,
`supabase/functions/partner-daily-digest/logic.test.ts` e os casos `tplPartnerDailyDigest` em
`_shared/email.test.ts`.
