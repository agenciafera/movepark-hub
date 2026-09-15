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
    Σ perna do parceiro × fração estornada      nas cobranças que FORAM ao gateway
                                                 (estorno total, parcial ou chargeback)
  − Σ payment.debt_recovered_cents               abatimentos gravados nas cobranças
  − Σ payout_debt_settlement.amount_cents        acertos manuais (parceiro pagou por fora)
```

Perna do parceiro é a regra do `payment.split` com `role = 'partner'` (regras antigas, sem `role`,
caem em `liable = true`, que era a marca do parceiro até esta spec). A fração estornada é
`refunded_amount / amount`, o mesmo rateio proporcional do extrato.

Por que `Σ perna × fração` e não `Σ (perna − abatimento) × fração`: quando uma venda que abateu
dívida é estornada, o abatimento foi pago com dinheiro do cliente, que voltou para ele. Contar a
perna inteira restaura o abatimento junto. A conta fecha sozinha: dívida antes `D`, venda com perna
`L` abate `R` (`D − R`), estorno total devolve `+L`, resultado `D + L − R`, que é exatamente o que o
parceiro ficou com a mais (`L − R`) somado ao abatimento desfeito (`R`).

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

## Modo rascunho (decidido em 15/09/2026)

Testar uma unidade de ponta a ponta (preço, reserva, pagamento, cancelamento) sem listar. Três
camadas travavam unidade não listada, e a resposta respeita cada uma:

| Camada | Trava | Como o rascunho passa |
|---|---|---|
| Banco | `check_availability`, `get_pricing_data`, `availability_batch`, `simulate_price` exigem `is_listed` (20261029100000) | migration `20261118140000`: `(l.is_listed or public.is_hub_admin())`. Sem sessão a exceção é falsa: anon, build do SSG e Worker seguem sem ver nada. pgTAP `modo_rascunho.test.sql` |
| Borda | o Worker devolve 404 na URL pública de unidade não listada, e não enxerga a sessão | a ficha em rascunho mora **dentro do Manager**: `/manager/companies/:companyId/locations/:locationId/rascunho`, navegação interna, nunca a URL pública |
| Leitura | `fetchListing` filtra `location.is_listed` | `fetchListingDraft(locationId)` dispensa o filtro (a RLS de admin enxerga a unidade) |
| Reserva | `ReservationCard` só deixava `customer` reservar | `hub_admin` também reserva; a reserva sai no nome do admin e o cancelamento é como staff, em Manager › Reservas |

Rascunho é unidade **viva** (`status = 'active'`, empresa ativa) e **não listada**. Unidade inativa
continua invisível até para hub_admin. O botão **Testar rascunho** aparece na lista de unidades da
empresa só para unidade não listada.

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
