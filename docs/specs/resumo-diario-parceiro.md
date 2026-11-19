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

## Assunto

Fixo e curto: **"Movimento de hoje: {empresa}"**. A parte fixa não tem acento. As contagens
("3 entradas, 2 saídas e 8 reservas novas") ficam só na prévia (preheader) e no corpo, porque o
assunto longo e acentuado foi o que sumiu entre 16 e 19/11/2026 (ver o incidente abaixo).

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

## Incidente de 16 a 19/11/2026: o resumo da Pare Seguro sumiu

O log marcava "enviado" e o SES aceitava, mas nada chegava. O denomailer 1.6 codifica o assunto
acentuado em quoted-printable e quebra a linha a cada 74 caracteres com `=\r\n`, que é quebra de
corpo e não de cabeçalho. Assunto longo com "saídas" ("Pare Seguro, movimento de hoje: 3 entradas,
2 saídas e 8 reservas novas") saía com o cabeçalho partido e o Gmail recusava depois do aceite do
SES, sem erro do nosso lado. Empresa com assunto curto (Nationpark, Abbapark) seguia recebendo.

Correção: `encodeSubject` em `_shared/email.ts` codifica o assunto em RFC 2047 (base64, palavras
dobradas) antes de entregar ao denomailer, para todo e-mail do Hub (as 28 Edges que enviam foram
publicadas de novo em 19/11). Além disso, o assunto do resumo virou fixo, sem contagens. Teste de regressão em
`_shared/email.test.ts`. "Enviado" no `partner_digest_log` quer dizer aceito pelo SES, não entregue:
devolução depois do aceite só aparece no console do SES.
