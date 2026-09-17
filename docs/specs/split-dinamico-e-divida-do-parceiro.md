# Split dinâmico e dívida do parceiro (fim da custódia) · E0.3.5

> **Status:** decidido e implementado em 15/09/2026 (commits `88a0b890`, `cba8870b` e o do split
> por empresa), no ar e inerte: chave global desligada, nenhuma empresa marcada. Substitui o modelo de custódia de
> [repasse-ao-parceiro.md](./repasse-ao-parceiro.md), que fica desligado. Base do gateway em
> [payment-split.md](./payment-split.md).

## Por que a custódia morre

A custódia (split desligado, cobrança inteira no master, repasse por `POST /transfers` entre
recebedores) dependia de uma capacidade que **a Pagar.me não liberou para a conta**: a transferência
entre recebedores. Sem ela, o dinheiro entra no master e não tem como sair para o parceiro por
regra nossa. O modelo volta a ser o desenhado no ADR-004: **split em toda cobrança**, o gateway
credita o parceiro na hora.

O que a custódia expunha continua existindo: cancelamento, estorno e chargeback acontecem depois de
o parceiro já ter recebido. A resposta passa a ser um **controle de banco do nosso lado** e o
**split dinâmico**, no modelo "Uber": quem ficou devendo tem as vendas seguintes abatidas até quitar.

## As decisões, uma a uma (15/09/2026)

| # | Decisão | Escolha |
|---|---|---|
| 1 | De quem sai o estorno no gateway | **100% do master da Movepark**, pela rota de cancelamento com split. O parceiro fica intacto no gateway; a dívida nasce no nosso razão |
| 2 | Chargeback | **`liable` na perna da Movepark.** Mesmo trilho do estorno: o gateway debita o master e a perna do parceiro vira dívida |
| 3 | Recebedores inexistentes (Gaita, Lisboa, Maxi, Motion, Virapark) | **Não recriar agora.** Empresa de teste é a **Agência Fera**, que já tem recebedor válido; só reativar a empresa |
| 4 | Abatimento por venda | **Até 100% da perna do parceiro.** Vende, abate, só volta a receber quando quitar |
| 5 | Venda de empresa sem recebedor com split ligado | **Bloqueia** (409 no checkout). Recebedor que o gateway não reconhece conta como ausente. **Revisto no mesmo dia:** o interruptor passou a ser **por empresa** (`company.gateway_split_enabled`), porque a chave global ligada bloqueou oito parceiros ativos, sete deles sem recebedor nenhum. Global ligada OU empresa marcada = split; o resto segue em custódia e não para de vender |
| 6 | Colchão no master (estorno exige saldo) | **Valor fixo em `app_setting`, com alerta no Manager** quando o saldo lido cai abaixo |
| 7 | Estorno fora do prazo do gateway (PIX 90 d, cartão 180 d) ou recusado | **Fila de reembolso manual no Manager.** A reserva cancela e libera a vaga; a devolução é feita por fora e marcada como paga |
| 8 | Taxa de estorno (PIX/gateway não voltam) | **Movepark absorve** |
| 9 | Parceiro devendo que para de vender | **Só registra e mostra.** Cobrança é contratual. Entra lançamento manual para quando ele paga por fora |
| 10 | Código da custódia e do repasse manual | **Fica no repo, desligado.** Sem cron, sem botão visível quando o split está ligado |
| 11 | Tela do parceiro | **Transparência total:** saldo devedor, abatimento por reserva e a origem da dívida |

## O modelo

### O que é dívida

```
dívida(empresa) =
    Σ (perna do parceiro − taxa que ele pagou) × fração estornada
                                                 nas cobranças que FORAM ao gateway
                                                 (estorno total, parcial ou chargeback)
  − Σ payment.debt_recovered_cents               abatimentos gravados nas cobranças
  − Σ payout_debt_settlement.amount_cents        acertos manuais (parceiro pagou por fora)
```

Perna do parceiro é a regra do `payment.split` com `role = 'partner'` (regras antigas, sem `role`,
caem em `liable = true`, que era a marca do parceiro até esta spec). A fração estornada é
`refunded_amount / amount`, o mesmo rateio proporcional do extrato.

**Líquida da taxa (17/09/2026, migration `20261120150000_divida_liquida_da_taxa.sql`).** A taxa
de processamento que o parceiro pagou na captura (`gateway_fee_cents`, quando a perna dele tem
`charge_processing_fee`) sai da dívida: ele devolve o que recebeu, e a Movepark absorve a taxa da
Pagar.me da venda cancelada. É a mesma regra do estorno híbrido (decisão 2 de
[estorno-hibrido.md](./estorno-hibrido.md)); antes, o mesmo cancelamento custava a taxa a mais
ao parceiro quando ele não tinha saldo (medido no MP-F65005: dívida R$ 14,40 contra R$ 14,22
recebidos). Enquanto a taxa não foi apurada pelo `reconcile-gateway-fees` (até 30 min depois do
pagamento), a dívida conta a perna inteira e cai sozinha na apuração. Vale em `payout_debt_cents`,
`payout_debt_lines` (origens) e no movimento `debt` do `partner_account_statement`.

Por que `Σ perna × fração` e não `Σ (perna − abatimento) × fração`: quando uma venda que abateu
dívida é estornada, o abatimento foi pago com dinheiro do cliente, que voltou para ele. Contar a
perna inteira restaura o abatimento junto. A conta fecha sozinha: dívida antes `D`, venda com perna
`L` abate `R` (`D − R`), estorno total devolve `+L`, resultado `D + L − R`, que é exatamente o que o
parceiro ficou com a mais (`L − R`) somado ao abatimento desfeito (`R`).

**E-mail ao parceiro (17/09/2026).** Cada cobrança que vira dívida gera um e-mail
(`tplPartnerDebtCreated`, pela guarda de silêncio): reserva, motivo, quanto será abatido (a mesma
conta da dívida, em TS: `_shared/debt-email.ts`) e o total a abater. Unicidade por
`payment.debt_email_sent_at` (migration `20261120190000_email_de_divida.sql`), reivindicado antes
do envio. Quem manda: `cancel-booking` na hora, e a varredura do cron `reconcile-payout-transfers`
(a cada 15 min) para chargeback, webhook e o que ficou para trás.

Dívida nunca é negativa na tela; se o cálculo cru ficar negativo (abatimento a mais por corrida
de duas vendas simultâneas, ver reserva abaixo), o excedente aparece no Manager como "a devolver".

### Split dinâmico, por cobrança

```
perna normal do parceiro = base − comissão(take_rate)
abatimento               = min(dívida reservada, perna normal)
perna do parceiro        = perna normal − abatimento
perna da Movepark        = comissão + tarifa + juros + abatimento
```

O abatimento é gravado em `payment.debt_recovered_cents` **na cobrança**. Sem número mágico: o
extrato do parceiro mostra, reserva a reserva, quanto foi abatido e de qual cancelamento veio a
dívida.

Se a perna do parceiro chega a zero, a cobrança vai **sem `split`** (100% master), que é o único
formato que o gateway aceita para "tudo para o principal". `split_sent_to_gateway` fica `true`
mesmo assim: a decisão foi do modo split, e o razão precisa saber que o parceiro não recebeu.

### Reserva do abatimento (a corrida de duas vendas)

Duas cobranças da mesma empresa no mesmo segundo não podem abater a mesma dívida duas vezes. A
cobrança só vira linha em `payment` **depois** de o gateway aceitar, então entre calcular e gravar
há uma janela. Entra a tabela `payout_debt_reservation`: a Edge chama
`payout_debt_reserve(company, max)` (advisory lock por empresa), que grava a reserva e devolve o
valor; a reserva conta como abatimento até ser **consumida** pela linha de `payment` (que carrega o
`reservation_id`) ou até **vencer** (15 min sem pagamento). Vencida, deixa de contar.

### Estorno: sempre 100% do master

`refundCharge` ganha `split`. Quando a cobrança foi ao gateway com split, o estorno vai com uma
regra só: o master, pelo valor estornado, `liable`/`charge_processing_fee`/`charge_remainder_fee`
verdadeiros. O gateway debita o master, o parceiro não sente nada, e a dívida entra no razão pela
fórmula acima (o `payment` vira `refunded`, ou ganha `refunded_amount` no parcial).

Cobrança que foi **sem** split (custódia, ou parceiro zerado pelo abatimento) estorna como hoje,
sem regra: o dinheiro já estava todo no master.

Cinco lugares estornam e os cinco passam pelo mesmo helper: `cancel-booking`, o "pago sem vaga" do
`pagarme-webhook` e do `reconcile-confirmations`, `delete-account` e `change-booking-dates-paid`.

### Chargeback

`charge.chargedback` já anda pelo trilho do estorno total no webhook (15/09/2026). Com `liable` no
master, o gateway debita a Movepark e a perna do parceiro entra na dívida pela mesma fórmula.
`refund_reason = "chargeback (contestação no banco)"` distingue na tela.

### `liable` muda de perna; a taxa de processamento não

| Regra | Antes | Agora |
|---|---|---|
| `liable` (chargeback) | parceiro | **Movepark** |
| `charge_processing_fee` | parceiro | parceiro (inalterado) |
| `charge_remainder_fee` | parceiro | parceiro (inalterado) |
| `role` (novo) | não existia | `partner` / `movepark`, gravado no snapshot |

A identificação da perna do parceiro no razão deixa de depender de `liable`: passa a ser `role`,
com `liable = true` como leitura das regras antigas. Todas as funções que hoje filtram por
`(r->>'liable')::boolean` mudam para `public.split_rule_is_partner(r)`.

### Colchão no master

Estornar R$ 200 exige "saldo atual" de R$ 200 no master, senão a Pagar.me recusa. A comissão
sozinha não sustenta (histórico: ~R$ 518 de comissão contra R$ 1.139 estornados). O cron
`refresh-recipients` passa a ler também o saldo do master (`GET /recipients/{master}/balance`) e
guarda em `gateway_account_balance`. `app_setting.pagarme_master_float_cents` é o piso; Manager ›
Financeiro mostra o saldo, o piso e o alerta.

### Fila de reembolso manual

Quando o gateway recusa de forma **definitiva** (4xx que não é 408/409/429: prazo vencido, saldo
insuficiente, cobrança em estado final), o cancelamento **não aborta mais**. A reserva cancela e
libera a vaga; entra uma linha em `payout_refund_manual` com valor, motivo da recusa e resposta
crua. O `payment` fica `paid` com `refund_reason` até alguém marcar a linha como paga no Manager,
quando ele vira `refunded` (e a dívida do parceiro entra pelo caminho normal). Recusa **incerta**
(5xx, rede, 408/409/429) continua abortando com "tente novamente", porque aí tentar de novo
funciona.

### Acerto manual

`payout_debt_settlement`: parceiro pagou por fora (PIX para a Movepark), ou ajuste. Só hub_admin
lança, com nota. Reduz a dívida na fórmula.

## Modelo de dados

| Objeto | Papel |
|---|---|
| `payment.debt_recovered_cents int not null default 0` | abatimento desta cobrança |
| `payment.debt_reservation_id uuid null` | a reserva que esta cobrança consumiu |
| `payout_debt_reservation` | `company_id`, `provider`, `amount_cents`, `expires_at`, `consumed_by_payment_id`, `created_at` |
| `payout_debt_settlement` | `company_id`, `provider`, `amount_cents`, `kind` (`manual_payment` / `adjustment`), `note`, `recorded_by`, `created_at`, `deleted_at` |
| `payout_refund_manual` | `booking_id`, `payment_id`, `amount_cents`, `reason` (`gateway_deadline` / `gateway_no_balance` / `gateway_refused`), `gateway_response jsonb`, `status` (`pending` / `paid` / `canceled`), `note`, `created_by`, `paid_by`, `paid_at` |
| `gateway_account_balance` | `provider` (pk), `recipient_id`, `available_cents`, `waiting_cents`, `transferred_cents`, `synced_at` |
| `app_setting.pagarme_master_float_cents` | piso do colchão |

### Funções

| Função | Papel |
|---|---|
| `split_rule_is_partner(jsonb) → boolean` | `role = 'partner'`, ou `liable` nas regras antigas |
| `payout_debt_cents(company, provider) → bigint` | a fórmula, com reservas vivas contando |
| `payout_debt_reserve(company, max_cents, provider) → (reservation_id, amount_cents)` | advisory lock, grava a reserva, devolve `min(dívida, max)` |
| `payout_debt_overview(provider) → jsonb` | Manager: dívida por empresa, idade, últimos movimentos |
| `payout_debt_lines(company, provider) → jsonb` | parceiro: origem (cancelamentos) e abatimentos (reservas) |
| `payout_refund_manual_mark_paid(id)` | hub_admin: marca a linha e vira o `payment` em `refunded` |
| `payout_balance` | ganha `debt_cents` e `debt_lines` |
| `payout_statement` | linhas ganham `debt_recovered_cents` |

## Interruptor por empresa (o que a primeira tentativa ensinou)

Em 15/09/2026 a chave global foi ligada e desligada em minutos: com ela, **oito parceiros ativos**
(Abbapark, Aeropark, Aerovalet, BePark, Garageinn, Nationpark, Plenty Park, Virapark) passaram a
tomar 409 no checkout, porque sete deles nunca tiveram recebedor e vendiam em custódia sem
precisar. Nenhuma cobrança passou na janela. O modelo novo não pode depender de todo mundo ter
recebedor no mesmo dia.

Migration `20261118113000`: `company.gateway_split_enabled` (nasce `false`), RPC
`company_set_gateway_split` (só hub_admin; recusa ligar sem recebedor ativo e reconhecido) e a
regra `effectiveSplitEnabled(global, empresa)` = global ligada OU empresa marcada, lida pelas
quatro Edges de cobrança. Manager › Financeiro › Recebedores ganhou a coluna **Split** com o
botão de ligar/desligar. Global desligada com empresas marcadas é o estado de transição: quem tem
recebedor entra no modelo novo, quem não tem segue em custódia.

## Modo rascunho e testadores (decidido em 15/09/2026, refeito em 16/09/2026)

Testar uma unidade de ponta a ponta (busca, filtros, ficha, pagamento, cancelamento) sem
publicar, **com conta de cliente**, porque a conta do Manager não fecha compra. O desenho é o dos
test users do Facebook: a equipe marca contas como **testador** e, logadas no site, elas veem a
unidade em rascunho como qualquer outra. Design e decisões em
`docs/superpowers/specs/2026-09-16-rascunho-e-testadores-design.md`.

**Rascunho é status na tela e flag no banco.** O select Status da unidade tem Ativa, Rascunho,
Inativa e Suspensa. Rascunho grava `status = 'active'` + `location.is_draft = true`
(`statusFieldFrom`/`statusFieldToPayload` em `useLocationForm.ts`). Não entra valor no enum
`entity_status`: ele é compartilhado com `company`, e todo corte do catálogo checa
`status = 'active'`. `is_draft` (migration `20261118160000`) mantém `is_listed = false` nos dois
gatilhos que listam (foto e recebedor ativo); voltar para Ativa publica de novo se a unidade tem
foto e a empresa pode receber. Na lista de unidades o badge é um só: "Rascunho".

**Quem vê:** `public.is_tester()` = service role (o nosso backend), `is_hub_admin()` ou linha
em `tester_user` (migrations `20261119093000` e `20261119170000`). A service role entra porque
as Edges de reserva e de mudança de data chamam o banco sem sessão de usuário, e sem isso o
`simulate_price` dentro de `_create_booking_core` devolvia "Preço indisponível" na primeira
compra de teste; quem decide o que o público vê é a RLS e as tools de leitura do chat e do MCP,
que correm com a anon key e o JWT do usuário. A RPC `admin_set_tester(uuid, boolean)` (só hub_admin) é a coluna **Testador**
em Manager › Usuários; hub_admin aparece como "sempre". O front lê `is_tester()` ao carregar a
sessão (`Session.isTester`). Um corte em todo lugar: `is_listed or (is_draft and is_tester())`.

| Camada | Trava | Como o rascunho passa para o testador |
|---|---|---|
| RLS | `catalog_read_location` exigia `is_listed` | recriada com o corte acima; `is_tester()` é executável por `anon` porque a policy roda como o chamador, e sem sessão devolve falso |
| Funções | `check_availability`, `get_pricing_data`, `availability_batch`, `simulate_price` | `(l.is_listed or (l.is_draft and public.is_tester()))`. Unidade não listada que não é rascunho fica invisível até para hub_admin. pgTAP `modo_rascunho.test.sql` (8) e `tester_user.test.sql` (14) |
| Busca | a Edge `search` lia com a anon key e ignorava o JWT que o front já mandava | `callerAuthorization(req, anon)` repassa o header, a RLS corre como o usuário; o resultado traz `location.is_draft` e o card mostra o selo "Rascunho" |
| Ficha | `fetchListing` filtrava `location.is_listed` | `.or("is_listed.eq.true,is_draft.eq.true")` na relação; a página mostra "Rascunho: o público ainda não vê esta unidade" ao lado do H1 |
| Reserva | `ReservationCard` | só `customer` reserva, como sempre; o testador É cliente |

O que não muda: `fetchAllFichaPaths` (build SSG) e `fichaPublicada` (Worker) seguem só com
`is_listed`. Rascunho não é pré-renderizado, não entra no sitemap e a URL direta devolve a casca
404; o testador chega pela busca. A página do destino também não lista rascunho (a lista de
unidades dela é só do loader SSG). O atalho "Testar rascunho" do Manager, a página
`/manager/.../rascunho` e a exceção de hub_admin no `ReservationCard` saíram em 16/09/2026.

## Próximo passo: estorno híbrido (E0.3.6)

Implementado em 16/09/2026 com a chave desligada: quando o recebedor do parceiro tem saldo
disponível que cobre a parte dele, o estorno vai com split e o gateway debita o parceiro; a
dívida só nasce quando o saldo não cobre. Ver [estorno-hibrido.md](./estorno-hibrido.md).

## Rollout

1. Migrations, funções, adapter, Edges e telas no ar, **global desligada e nenhuma empresa marcada**.
   Tudo inerte. (Feito em 15/09/2026.)
2. Quando uma empresa tiver recebedor ativo e reconhecido, ligar o split dela em Manager ›
   Recebedores. A primeira candidata é a Agência Fera, que continua suspensa por decisão de
   15/09/2026 (a unidade dela está listada e reativar a empresa a devolve ao site).
3. Uma venda real de teste, um cancelamento com estorno, e a conferência: o estorno saiu do master,
   o recebedor do parceiro não se moveu, a dívida apareceu no Manager e na tela dele, a venda
   seguinte abateu.
4. Colchão do master: `pagarme_master_float_cents = 300000` (R$ 3.000, decidido em 15/09/2026). O
   master tinha R$ 185,15 na primeira leitura, então o alerta já dispara.

## O que fica de fora

- Cobrança automática de dívida (decisão 9).
- Transferência parceiro → master para puxar dívida: a Pagar.me não liberou a rota.
- Limite de antecedência na venda (a fila manual cobre o caso).
