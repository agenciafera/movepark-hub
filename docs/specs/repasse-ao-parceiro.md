# Repasse ao parceiro (custódia) — E0.3.4

> **Status:** implementado e no ar em 11/09/2026, faltando só o primeiro repasse real, que é ato de
> gente. Fecha o buraco entre o extrato dizer quanto devemos e o dinheiro sair. Ver
> [payment-split.md](./payment-split.md) para o modelo de custódia.

## Como ficou

| Peça | Onde |
|---|---|
| Marca por cobrança | `payment.split_sent_to_gateway`, gravado pelas 4 Edges que cobram; migration `20261115090000` |
| Quanto devemos | `payout_owed_cents(company)`; `payout_balance` ganhou `owed_cents`/`transferred_cents` |
| Registro do repasse | `payout_transfer` + `payout_transferred_cents`; migration `20261115113000` |
| Pedido server-authoritative | RPC `payout_transfer_request` (advisory lock, recalcula o devido, retoma o pendente) |
| Visão do painel | RPC `payout_owed_overview`; migration `20261115140000` |
| Gateway | `createTransfer` + `getRecipientBalance` na interface; `buildTransferBody` nunca emite `recipient_id` |
| Disparo | Edge `create-payout-transfer` (JWT de hub_admin, pré-voo de saldo, `Idempotency-Key`) |
| Webhook | ramo `transfer.*` casa `payout_transfer` antes de `payout_withdrawal` |
| Tela | `PayoutTransferCard` em Manager › Repasses, com diálogo de confirmação |

Testes: pgTAP `payout_owed.test.sql` (6) e `payout_transfer.test.sql` (19); Deno para o adapter, a
lógica da Edge, o contrato de custódia das Edges de cobrança e a ordem do ramo `transfer.*`; Vitest
para o card e o diálogo.

## O problema

Com `app_setting.pagarme_split_enabled = 'false'`, a cobrança inteira cai no recebedor master da
Movepark e o `payment.split` virou razão contábil do que devemos ao parceiro. O extrato
(`payout_statement`) e o saldo (`payout_balance`) dizem quanto é. **Nada no repo move esse
dinheiro.** Nenhuma linha chama `POST /transfers`. A saída é operação manual fora do sistema, sem
registro, sem idempotência e sem quem conferir depois.

## Os dois hops, que são o mesmo endpoint

`POST /transfers` tem duas semânticas, definidas pelo **corpo**. Esta é a armadilha central da rota.

| Corpo | O que faz | Onde mora hoje |
|---|---|---|
| `{ amount, recipient_id }` | **Saque**: o recebedor é a origem, o destino é a conta bancária dele | `payout_withdrawal`, alimentada pelos webhooks `transfer.*` |
| `{ amount, source_id, target_id }` | **Repasse entre recebedores** | não existe |

O repasse é o hop 1 (master da Movepark → recebedor do parceiro, dentro do Pagar.me). O saque é o
hop 2 (recebedor do parceiro → banco dele) e já funciona.

Pré-requisitos do repasse, pela
[doc](https://docs.pagar.me/page/transferência-entre-recebedores): pelo menos um dos lados precisa
ser o **recebedor principal da conta**, e recebedor com id no formato antigo (`rp_`) não é aceito.
Os nossos são `re_`, e o master (`app_setting.pagarme_movepark_recipient_id`) é o principal.

## Modelo

### Tabela nova `payout_transfer`

Tabela própria, **não** reuso de `payout_withdrawal`. Misturar as duas semânticas na mesma tabela
faria o "já transferido" da tela do parceiro contar o mesmo dinheiro duas vezes: o repasse que
entrega e o saque que ele tira depois.

| Coluna | Papel |
|---|---|
| `company_id` | parceiro a quem devemos |
| `provider` | `pagarme` |
| `amount_cents` | valor do repasse |
| `status` | reusa o enum `payout_withdrawal_status` (`created`/`processing`/`paid`/`failed`/`canceled`) |
| `idempotency_key` | **unique**, nasce no banco, vai no header da Pagar.me |
| `external_transfer_id` | id no gateway, unique quando não nulo |
| `source_recipient_id` / `target_recipient_id` | as duas pernas, gravadas no ato |
| `requested_by` | quem clicou (FK `profiles`) |
| `requested_at` / `paid_at` / `failed_reason` / `raw` | ciclo e diagnóstico |

**RLS:** `hub_admin` full; `company_operator` só SELECT das próprias linhas; nenhuma escrita por
RLS (toda escrita passa pela Edge, com service_role). Espelha `payout_withdrawal`.

### Quanto devemos: por cobrança, não por flag global

A decisão foi que o saldo depende do **modo de split**. Implementado **por cobrança**, não pelo
valor atual da chave: `payment` ganha `split_sent_to_gateway boolean`, gravado pelas quatro Edges
que cobram no momento da cobrança.

Ler a chave global na hora do extrato daria resposta errada para o passado, porque ela muda e o
histórico não. Guardar por cobrança responde a pergunta certa: *quando esta venda aconteceu, o
gateway creditou o parceiro?*

```
devido = Σ (perna do parceiro, líquida de estorno parcial)
           das cobranças `paid`, `kind = 'booking'`, com split NÃO enviado
       − Σ (repasses em created / processing / paid)
```

**Backfill do passado.** Cobranças pagas antes de **31/07/2026 14:44 UTC** (a MP-BE2E2B, primeira
venda documentadamente sem split) entram como `split_sent_to_gateway = true`, ou seja, nada devido.
Duas evidências sustentam isso: o interruptor só passou a existir em 31/07/2026, e as 24 cobranças
anteriores não têm recebível nenhum em `GET /payables` na conta viva, o que confirma que são da
fase de sandbox e que aquele dinheiro nunca existiu na conta de produção.

`NULL` (desconhecido) conta como **enviado**, ou seja, não devido. É o lado seguro: errar para
menos é recuperável com um repasse novo; errar para mais paga duas vezes o mesmo dinheiro.

### O que muda em `payout_balance`

| Campo | Antes | Depois |
|---|---|---|
| `net_partner_cents` | líquido do parceiro | igual |
| `withdrawn_cents` | saques pagos | igual, mas **sai da conta da dívida** |
| `transferred_cents` | não existia | repasses em `created`/`processing`/`paid` |
| `balance_cents` | `net − saques` | `devido − repasses` |

O saque deixa de descontar a dívida porque é o parceiro tirando dinheiro que já é dele. Continua
visível em `withdrawn_cents`, como informação da tela dele.

## Fluxo

1. hub_admin abre **Manager › Repasses** e vê, por empresa, quanto está devido.
2. Clica **Repassar**. O diálogo mostra empresa, recebedor de destino e valor, e pede confirmação.
3. Edge **`create-payout-transfer`** (JWT de `hub_admin`):
   a. RPC `payout_transfer_request` pega advisory lock por empresa, **recalcula o devido no
      servidor** e recusa valor acima dele. O valor que o front manda é conferência, não fonte.
   b. Recusa se já existe repasse `created`/`processing` para a empresa (evita dois cliques).
   c. Pré-voo: recebedor do parceiro `active` e `GET /recipients/{master}/balance` com
      `available_amount >= amount`.
   d. `gateway.createTransfer(...)` com header `Idempotency-Key`.
   e. Grava `external_transfer_id` e o status devolvido.
4. O webhook `transfer.*` fecha o ciclo.

**Retentativa é segura por desenho.** Se a chamada ao gateway falhar depois de a linha existir, ela
fica em `created` sem `external_transfer_id`, e a próxima tentativa **reusa a mesma linha e a mesma
chave de idempotência** em vez de criar outra. Sem isso, um timeout vira transferência duplicada.

## Webhook: casar repasse antes de saque

O ramo `transfer.*` do `pagarme-webhook` passa a procurar **primeiro** o `external_transfer_id` em
`payout_transfer`; só se não achar é que trata o evento como `payout_withdrawal`. Sem essa ordem,
todo repasse que a Movepark fizer vira uma linha falsa de saque na tela do parceiro, inflando o
"já transferido" com dinheiro que ele ainda não tirou.

## Camada de abstração (ADR-004)

Entram na interface `PaymentGateway`:

- `createTransfer({ amountCents, sourceRecipientId, targetRecipientId, idempotencyKey })`
- `getRecipientBalance(recipientId)`

O `PagarmeGateway` monta o corpo e o header; o `MockGateway` devolve resultado sintético. O domínio
não sabe que `POST /transfers` tem dois corpos possíveis: quem sabe disso é o adapter.

## O que fica de fora, de propósito

- **Nenhum cron.** Repasse não sai sozinho. A decisão de mover dinheiro é de gente.
- **Nenhum caminho de parceiro.** `payouts:write` é do Dono, para saque e KYC. Repasse é ato da
  Movepark, gateado por `is_hub_admin()`.
- **Nenhum lote.** `POST /transfers` tem rate limit apertado (`x-ratelimit-limit: 7`), e o primeiro
  uso precisa ser um de cada vez, com alguém olhando. Lote reabre quando houver volume.
- **Estorno de repasse.** Repasse feito a mais se resolve com o parceiro, não com código.

## Testes

| Camada | O que cobre |
|---|---|
| pgTAP | RLS de `payout_transfer`; gate `is_hub_admin` na RPC; recusa de valor acima do devido; recusa de repasse concorrente; `balance_cents` descontando repasse; `split_sent_to_gateway` mudando o devido |
| Deno | `buildTransferBody` (as duas pernas, nunca `recipient_id`), `buildTransferResult`, header `Idempotency-Key`, `buildBalanceResult`; roteamento do webhook (repasse casa antes de saque) |
| Vitest | gating do botão por papel, diálogo de confirmação, valor exibido |

## Primeiro repasse real: pendente, por decisão

Tudo está no ar e o caminho foi ensaiado com os dados reais em transação revertida: o painel lista
a **Agência Fera** com R$ 76,50 em aberto (`re_cms7wc1eievek0l9tfxnb8wz2`, `active`), e a RPC monta
o pedido com as duas pernas corretas (`re_cms5cvg…` → `re_cms7wc1…`) e chave de idempotência
própria. O único passo nunca exercitado é a chamada `POST /transfers` em si.

Decidido em 11/09/2026: **nenhum repasse automático de validação.** O primeiro clique é de gente,
em Manager › Repasses. Quem apertar deve conferir depois:

1. `payout_transfer` com `external_transfer_id` preenchido e status `processing` ou `paid`.
2. O evento `transfer.*` caindo em `payout_transfer`, **não** em `payout_withdrawal` (é o que a
   ordem do ramo no `pagarme-webhook` garante, e é o erro mais fácil de não perceber).
3. O painel recalculando o devido para R$ 0,00 depois de `paid`.

Se a chamada falhar, a linha fica em `created` de propósito e o botão **retoma a mesma linha**, com
a mesma chave de idempotência. Clicar de novo não cria um segundo repasse.
