# Gateway de pagamento com split — Recebedores (E0.1 · ADR-004)

> **Status:** E0.1.1 (camada de vínculo) + E1.3 (coleta de KYC) implementadas. Cobrança PIX/cartão
> com split (E0.1.2/.3) e webhooks de `booking.status` (E0.1.4) são as próximas subtarefas.

## ADR-004 — Gateway = Pagar.me (recebedores), atrás de uma camada de abstração

Regra fixa do projeto:

- O gateway é o **Pagar.me**. Split por **Recebedores** geridos na conta da Movepark — o parceiro
  **não cria conta** no gateway nem é abordado por ele (**fica invisível**).
- **PIX + cartão, PIX-first.**
- KYC do recebedor é coletado na **UI da Movepark** (E1.3), **nunca** redirecionando pro Pagar.me.
- **Camada de abstração obrigatória:** o domínio fala apenas pela interface `PaymentGateway`
  (`supabase/functions/_shared/payments`); o Pagar.me existe só no adapter. Trocar de gateway no
  futuro = novo adapter, sem tocar no domínio.

## Transição para custódia — o split no gateway virou interruptor (jul/2026)

**Estado atual: o split NÃO é enviado ao Pagar.me.** A chave `app_setting.pagarme_split_enabled`
nasce como `'false'` (migration `20260920000000_pagarme_split_toggle.sql`). Com ela desligada, as
quatro Edges que cobram (`create-pix-charge`, `create-card-charge`, `create-fare-upgrade`,
`change-booking-dates-paid`) omitem a chave `split` do pedido e o valor cai inteiro na conta da
Movepark. A Pagar.me abriu uma conta escrow para a Movepark, e o repasse ao parceiro passa a ser
operação nossa.

Detalhe que não é opcional: a chave precisa ser **omitida**, nunca enviada como array vazio. A API
valida o array e recusa o pedido. Está resolvido em `buildOrderBody` e `buildCardOrderBody` com
spread condicional, e coberto por teste.

**O snapshot `payment.split` continua sendo gravado nos dois modos.** Ele deixou de ser instrução
para o gateway e passou a ser o razão de quanto devemos ao parceiro. É dele que `payout_statement`
e `payout_balance` derivam, então o extrato do parceiro continua correto: o que muda é onde o
dinheiro está, não a conta.

**Como o repasse sai daqui: `POST /transfers` tem DUAS semânticas, definidas pelo CORPO.** Esta é a
armadilha central da rota, e custou caro descobrir: o endpoint é o mesmo, o que muda é o payload.

| Corpo | O que faz |
|---|---|
| `{ amount, recipient_id }` | **Saque.** O recebedor é a ORIGEM e o destino é a conta bancária dele |
| `{ amount, source_id, target_id }` | **Repasse entre recebedores.** É o que serve à custódia |

O saque está **provado** em produção (31/07/2026, transfer `539328550`): saiu com `source_type:
recipient` apontando para a Agência Fera e `target_type: bank_account`, e o saldo dela caiu de 11329
para 9962 (1000 do saque mais 367 de taxa), sem o master se mover.

O repasse entre recebedores está **documentado** em
<https://docs.pagar.me/page/transferência-entre-recebedores>, com dois pré-requisitos: pelo menos um
dos lados (`source_id` ou `target_id`) precisa ser o **recebedor principal da conta**, e recebedor
com id no formato antigo (`rp_`) não é aceito, tem que recriar. Os nossos são `re_`.

Consequência para a arquitetura: **o modelo de custódia fecha inteiro dentro do Pagar.me.** Cobrança
sem split cai no master, a Movepark segura e calcula, e o repasse vira `POST /transfers` com
`source_id` (master) e `target_id` (parceiro). Ou seja, **o recebedor, o KYC e a prova de vida
continuam necessários**: sem recebedor ativo não existe `target_id`.

Reprodutível no workflow n8n `80lgEb2uOYQqSPzn` ("Pagarme - Transferencia (probe)"), com o nó de
transferência desligado por padrão porque move dinheiro real.

> **Lição de método, registrada de propósito.** A conclusão anterior desta seção dizia que não
> existia rota para creditar recebedor. Ela veio de um teste que usou `recipient_id`, montado a
> partir da suposição que se queria verificar, e o resultado foi então usado para confirmar a
> suposição. O teste estava certo sobre o que testou e errado sobre a pergunta. Antes de declarar
> que uma capacidade não existe no gateway, varra o índice de endpoints E as páginas de guia
> (`/page/...`), não só a referência (`/reference/...`): esta rota só aparece descrita em `/page`.

**Também validado no mesmo dia: a cobrança sem split funciona.** MP-BE2E2B (R$ 102,90) saiu sem a
chave `split` e caiu inteira no master da Movepark; o saldo do parceiro não recebeu nada; e o
`payment.split` foi gravado com as duas pernas (7650 parceiro / 2640 Movepark), mantendo o extrato
de pé. Payload sem split, razão preservado.

**Medido em produção (31/07/2026), o que já é fato:**

- Saldo é **por recebedor**: `GET /recipients/{id}/balance` responde 200 com `available_amount`,
  `waiting_funds_amount` e `transferred_amount`. `GET /balance` no nível da conta dá **404**.
- O dinheiro da Movepark cai no recebedor master (`app_setting.pagarme_movepark_recipient_id`).
- **A taxa do gateway é R$ 1,46 numa venda de R$ 147,90 (0,99%)** e hoje sai inteira do parceiro:
  a perna dele recebeu 11475 e ficou com 11329 disponível, enquanto a perna da Movepark recebeu
  3315 e ficou com 3315. É o custo que nunca entrou no nosso banco e que a custódia transfere
  para a Movepark.
- `POST /transfers` tem rate limit apertado (`x-ratelimit-limit: 7`). Repasse em lote precisa
  respeitar isso, e a rota aceita header `Idempotency-Key` (usar desde o início, senão retry vira
  transferência duplicada).

**Reverter é trocar a chave para `'true'`.** O código dos dois modos convive.

### Pontos abertos que a custódia expõe

- `payout_withdrawal` só é alimentada pelos webhooks `transfer.*`. Sem saldo do parceiro no
  gateway, ela para de receber linhas e o "já transferido" da tela do parceiro congela.
- ~~Não existe código que execute o repasse.~~ **Resolvido em 11/09/2026:** o repasse entrou em
  [repasse-ao-parceiro.md](./repasse-ao-parceiro.md) (E0.3.4). `payout_balance.balance_cents` mudou
  de significado junto: deixou de ser "líquido menos saques" e passou a ser "quanto a Movepark ainda
  deve", com o saque saindo da conta da dívida (ele é o parceiro tirando dinheiro que já é dele).

### Corrigido em 11/09/2026: o extrato passou a devolver só o que é devido

Migration `20261114101500_extrato_repasse_so_o_que_e_devido.sql`, pgTAP
`payout_statement_correcao.test.sql`. Duas contas erradas em `payout_statement`/`payout_balance`:

**Receita de serviço da Movepark entrava como dívida com o parceiro.** `create-fare-upgrade` e
`change-booking-dates-paid` cobram valor 100% nosso e gravam o split com **uma perna**, apontando
para o recebedor master, com `liable: true`. Esse `true` é exigência do gateway (o split precisa de
um responsável por chargeback), não titularidade do dinheiro. Como a leitura classificava parceiro
por `liable`, a Tarifa e a diferença de datas viravam repasse devido. Quem separa os casos agora é
**`payment.kind`**: só `booking` tem perna de parceiro. Comparar o `recipientId` com
`app_setting.pagarme_movepark_recipient_id` foi descartado, porque trocar o recebedor master
reescreveria o passado de todo extrato já emitido.

Medido em produção no dia da correção: **R$ 224,00** saíram da coluna de devido (Motion Park R$
149,40 em 6 upgrades; Virapark R$ 24,90 em 2 upgrades mais R$ 49,70 de uma troca de datas).

**Estorno parcial não era descontado.** O total muda o status para `refunded` e some do líquido
sozinho; o parcial (evento `charge.partial_canceled`, hoje feito no painel da Pagar.me) deixa o
pagamento em `paid` com `refunded_amount` preenchido, e o valor seguia contando inteiro. Com
custódia isso é repasse indevido em dinheiro. O desconto agora é **proporcional nas duas pernas**,
espelhando a reversão do gateway, e a identidade `bruto − estornado = líquido` continua fechando.
Medido: **R$ 87,60** a menos no saldo do Virapark, de uma reserva de R$ 149,50 com R$ 109,50
estornados.

A linha do extrato (`p_include_lines`) passou a mostrar o valor já líquido do estorno parcial. Os
nomes dos campos do JSON não mudaram, então o front não muda.

### Corrigido em 11/09/2026: a taxa do gateway virou lançamento

Migration `20261114143000_taxa_do_gateway_vira_lancamento.sql`, pgTAP `gateway_fee.test.sql`.

Antes da custódia o desconto da taxa acontecia dentro do Pagar.me, pelo `charge_processing_fee` na
perna do parceiro, e nunca precisou existir no nosso banco. Com o split desligado a cobrança
inteira cai na Movepark e a taxa virou custo nosso, sem lançamento: o Faturamento mostrava comissão
bruta e a margem real era sempre menor que a da tela.

**A taxa não vem na order nem na charge.** O único lugar da Core v5 que traz é
**`GET /payables?charge_id=…`**, um recebível por parcela, com `fee`, `anticipation_fee` e
`fraud_coverage_fee` ([doc](https://docs.pagar.me/reference/retornando-receb%C3%ADveis)). O
recebível também não nasce no mesmo instante do `charge.paid`, então a apuração é assíncrona.

| Peça | Onde |
|---|---|
| Leitura no gateway | `listPayables(chargeId)` na interface `PaymentGateway`; `buildPayablesResult` no adapter |
| Soma do custo | `_shared/payments/fees.ts` (`totalGatewayFeeCents`), fora do adapter porque opera no tipo agnóstico |
| Persistência | `payment.gateway_fee_cents` + `gateway_fee_synced_at`, com índice parcial do que falta apurar |
| Apuração | Edge `reconcile-gateway-fees`, cron de 30 min, lote de 25, janela de 10 min a 90 dias |
| Exibição | Manager › Repasses: taxa e **margem** (comissão menos taxa) ao lado da comissão |

**Nulo é "ainda não apurado", e isso não é detalhe.** Gravar zero quando o recebível não existe
esconderia justamente o que falta apurar. A Edge carimba `gateway_fee_synced_at` na tentativa e
deixa o valor nulo, e o extrato soma só o que tem valor.

Provado na primeira execução: **MP-BE2E2B**, a venda real de R$ 102,90 de 31/07/2026, apurou
**R$ 1,02**, ou 0,99%, exatamente a taxa medida por saldo de recebedor naquele dia. As outras 24
cobranças do lote são da fase de sandbox e não têm recebível, então ficaram nulas.

**Armadilha do cron:** o default de `timeout_milliseconds` do `pg_net` é 5 s, e o lote são até 25
consultas sequenciais. Com o default a Edge roda até o fim, mas o `pg_net` desiste antes e grava
`Timeout of 5000 ms reached` em `net._http_response`, deixando a apuração sem resposta para olhar.
O job envia `timeout_milliseconds := 60000`. Os outros crons de reconciliação usam o default e têm
o mesmo risco quando o lote cresce.

### Corrigido em 11/09/2026: vender não depende mais de ter recebedor

Com a custódia ligada o split **não** vai ao gateway e a cobrança cai inteira na conta da Movepark.
Mesmo assim, `create-pix-charge` e `create-card-charge` recusavam com **409** qualquer unidade cujo
parceiro não tivesse `payout_recipient.external_recipient_id`. Exigiam um recebedor que aquele
caminho não usa.

Isso contradizia duas decisões do próprio projeto: a separação entre "publicar no catálogo" e
"estar apto a receber" (a razão de `payout_recipient.status` existir à parte do `onboarding_status`,
logo abaixo), e o E1.9, que deixa o parceiro publicar **antes** do KYC de propósito. Na prática,
todo parceiro que publicasse e recebesse reserva antes de concluir o KYC via o cliente chegar até a
tela de pagamento e travar ali, depois de preencher tudo.

O gate passou a ser condicional (`splitEnabled && !recipient`), e `buildSplit` ganhou
`requireRecipients`: com o split indo ao gateway os ids seguem obrigatórios (ele precisa saber para
quem mandar); em custódia a perna do parceiro nasce com `recipientId: null`. O snapshot continua
sendo gravado, porque é o razão do que devemos, e quem lê esse razão (`payout_owed_cents`,
`payout_statement`) usa `liable` e o valor, **nunca** o `recipientId`; o repasse pega o destino em
`payout_recipient`. Resultado: vende agora, paga quando o KYC sair, e a
[RPC do repasse](./repasse-ao-parceiro.md) continua exigindo recebedor `active` na hora de mover o
dinheiro.

Cinco unidades estavam nesse estado em produção (Airpark Faro e Lisboa, Redpark Lisboa, Skypark
Lisboa e Moveparking Nova Iguaçu, todas do seed de 27/05/2026).

## Por que um estado próprio de "ficha para receber"

`company.onboarding_status` (`pending_review→approved→in_progress→active→rejected`) é sobre
**publicar no catálogo** (go-live). Estar **apto a receber** é outro concern (análise do gateway,
KYC, dados bancários) — por isso tem ciclo próprio em `payout_recipient.status`. Uma empresa pode
estar `active` no catálogo e ainda `pending`/`action_required` para receber.

## Modelo de dados (migration `20260627000000_payout_recipients.sql`)

Separa três conceitos:

| Tabela / coluna | Concern | Agnóstico ao gateway? |
|---|---|---|
| `company.take_rate_bps` | Comissão da Movepark retida no split (basis points; default global `app_setting.default_take_rate_bps` = `2000` = **20%**, e o mesmo valor no default da coluna). Nasceu 1500 na migration `20260627000000` e foi para 2000 **à mão em produção**, sem migration; o repo só se alinhou em 11/09/2026 (`20261116093000`), até então um stack novo nascia cobrando 5 pontos a menos sem ninguém notar. Por **empresa**. Editável em **Manager › Financeiro › Comissões** (`/manager/finance/commissions`), via RPC `set_company_take_rate` (gate `is_hub_admin`, valida 0..10000; migration `20260723000000`). O **Faturamento** (`finance-billing`) calcula a comissão com essa taxa real por empresa (não há mais taxa fixa). | ✅ |
| `company_payout_account` (1:1 com company) | Dados de **banco/KYC** do parceiro (CNPJ/CPF, conta, titular). Preenchido na UI da Movepark (E1.3). **Nunca** exposto ao front. | ✅ |
| `payout_recipient` (único por `(company_id, provider)`) | Registro do recebedor **no gateway**: `external_recipient_id`, `status`, `last_provider_status` (cru), `kyc_url`, `requirements` (pendências). | ❌ (por provider) |
| `payout_recipient_event` (append-only) | **Log** de cada interação com o gateway (`create`/`refresh`/`webhook`): `http_status`, `request` (redigido), `response` cru. Fonte das pendências a comunicar ao parceiro. | — |

**RLS:** `hub_admin` full nas três; `company_operator` só **SELECT** das próprias linhas (via
`current_company_ids()`); **nenhuma escrita por RLS** — toda escrita passa pela Edge `sync-recipient`
(service_role). Espelha o padrão de `api_request_log`/`company_onboarding`.

### Ciclo de vida `payout_recipient_status`

```
draft ──────────→ pending ──────────→ active        (apto a receber)
(criado na        (enviado ao          ↑
 Movepark,         gateway, em          │
 não enviado)      análise)             │
                      │                 │
                      └→ action_required ┘   (gateway pediu verificação: kyc_url + requirements)
                      └→ refused             (recusado)
active ───────────────→ suspended            (bloqueado depois de ativo)
```

## Camada de abstração — `supabase/functions/_shared/payments/`

- **`types.ts`** — `PaymentGateway` (interface), `RecipientInput` (dados agnósticos),
  `RecipientResult` (`externalId`/`status`/`rawStatus`/`kycUrl`/`requirements`/`raw`/`httpStatus`),
  `RecipientStatus` (espelha o enum SQL), `GatewayConfigError`. Cobranças (`createCharge`/`refund`)
  entram em E0.1.2/.3 — a interface reserva o lugar.
- **`pagarme.ts`** — `PagarmeGateway` + helpers puros testáveis: `pagarmeBaseUrl` (host ÚNICO da
  Core v5 `api.pagar.me`; o ambiente é definido pela **chave**, não por host: só o teste tem prefixo
  (`sk_test_`), a chave viva é `sk_<hash>` (**não** existe `sk_live_`; `sdx-api` é da skill de
  Checkout e **não** atende a Core v5), `pagarmeAuthHeader`
  (Basic `base64(secret:)`), `mapRecipientStatus`, `normalizeRequirements`, `extractKycUrl`,
  `buildCreateRecipientBody`, `buildRecipientResult`.
- **`mock.ts`** — `MockGateway` (aprova na hora; paridade com `payment.provider='mock'`).
- **`index.ts`** — `getGateway(provider)`: **único ponto de dispatch** por provider.

> ⚠️ O **corpo exato** de `POST /recipients` e a forma do link de KYC dependem da **Recipients API
> doc** do Pagar.me (a confirmar). `buildCreateRecipientBody` monta o que já temos (banco + código +
> dados básicos); os campos completos de KYC chegam com E1.3 — até lá o gateway responde com
> `requirements`, que é justamente o fluxo de verificação. Toda a lógica pura já é testável sem rede.

## Edge Function — `supabase/functions/sync-recipient`

`POST /functions/v1/sync-recipient` · `Authorization: Bearer <JWT hub_admin>` ·
`{ company_id, action: "create" | "refresh", provider?: "pagarme" }`

- Restrito a **hub_admin** (mesmo padrão de `approve-partner`: `userClient` p/ auth + `admin`
  service-role p/ escrita; `runBg` para o evento de log; nunca loga segredo).
- Garante a linha `payout_recipient` (`draft`).
- `create`: lê `company_payout_account` → `getGateway(provider).createRecipient(...)` → grava
  `external_recipient_id`/status/`kyc_url`/`requirements` e registra `payout_recipient_event`.
- `refresh`: `getRecipient(externalId)` → atualiza status/pendências/link e registra evento.
- Resposta: `{ ok, status, external_recipient_id, kyc_url, requirements }`.

### Prova de vida (KYC link)

O `PagarmeGateway` resolve o link de prova de vida **dentro do adapter** (domínio fica limpo): ao
criar/sincronizar, se o status normalizado ainda pode exigir KYC (`recipientCanNeedKyc` → `pending`
ou `action_required`), chama `POST /recipients/{id}/kyc_link`. Se o gateway devolve um link (200),
o resultado vira `action_required` com `kyc_url`; se devolve **404** (prova de vida não aplicável —
o caso de **staging, que aprova automaticamente**), segue sem link. Não há cenário de produção ainda,
então é só isto: aprovou → `active` sem link; precisa de prova de vida → guardamos o `kyc_url`.

O parceiro vê e clica no link pelo **`RecipientKycBanner`** (status `action_required` + `kyc_url`),
exibido na **dashboard do operador** e no **passo "Recebimento"** do wizard; o hub_admin também vê o
link no `RecipientPanel`.

### Fluxo (como o parceiro fica vinculado)

1. Parceiro aprovado no Manager (`approve-partner`) → existe `company`.
2. Dados de banco/KYC entram em `company_payout_account` (manual para o recebedor de teste; UI = E1.3).
3. hub_admin aciona **Criar recebedor** no painel → `sync-recipient` `create` → recebedor criado no
   gateway, `external_recipient_id` gravado, status refletido.
4. Se o gateway pede verificação → `status = action_required`, `kyc_url` + `requirements` exibidos no
   Manager para o parceiro resolver. **Sincronizar status** (`refresh`) reavalia.

## Frontend (Manager) — `src/features/payouts/`

- `api.ts` — `useRecipient(companyId)`, `useSyncRecipient()` (invalida `payoutKeys.all`),
  `useRecipientsOverview()` (todas as empresas + recebedor embutido, para a visão consolidada).
- `status.ts` — `payoutStatusLabel`/`payoutStatusTone` (espelha `onboarding/status.ts`).
- `RecipientPanel.tsx` — badge de status, link de verificação, lista de pendências e botão
  **Criar/Sincronizar recebedor**; embutido no `ApplicationDrawer` quando o parceiro está
  `approved`/`in_progress`/`active`.

### Visão consolidada — Manager → **Recebedores** (`/manager/finance/recipients`)

Painel de manutenção (hub_admin) que lista **todas as empresas com o status do recebedor** no
gateway e permite **criar/sincronizar** por linha (mesma Edge `sync-recipient`) + **Editar KYC**
(`PayoutKycDialog`). Resolve a dor operacional do checkout falhar com *"o estacionamento ainda não
tem recebedor ativo no gateway"*: empresas publicadas sem recebedor `active` sobem como **"precisa de
atenção"** (`needsAttention` = vende no catálogo mas `recipient_status != 'active'`). Lógica pura
testável em `src/routes/manager/finance-recipients.logic.ts` (mapeamento, ordenação, resumo).
A ação **Criar recebedor** só aparece quando a empresa **já tem KYC** (`company_payout_account`);
sem KYC, o botão vira **Preencher KYC**. Quando há `external_recipient_id`, vira **Sincronizar**.

### Sincronização do status do recebedor (3 caminhos)

O `payout_recipient.status` é um snapshot local; é mantido fresco por:

1. **Webhook (push)** — `pagarme-webhook` trata `recipient.*` (`recipient.updated`/`created`): casa por
   `external_recipient_id`, mapeia o status cru (`mapRecipientStatus`) e atualiza `status` +
   `last_provider_status` (log em `payout_recipient_event` kind `webhook`). Self-healing — vira
   "Apto a receber" sozinho quando o gateway aprova. Cadastrar o evento no painel do Pagar.me.
2. **Cron (poll de segurança)** — Edge `refresh-recipients` (`verify_jwt=false`, header
   `x-refresh-recipients-key` do Vault) reavalia via `getRecipient` os que estão `pending`/
   `action_required` com `external_recipient_id`; pg_cron `refresh-recipients` a cada 15 min
   (migration `20260719000000`).
3. **Manual** — botão **Sincronizar** na linha (`sync-recipient` action `refresh`).

> **Hardening (E2.8):** o `create` do `sync-recipient` **não** avança o status quando o gateway não
> devolve `external_recipient_id` (falha) — antes isso deixava um recebedor "Em análise" fantasma sem
> id, que não dava pra sincronizar nem recriar. Agora mantém `draft` e devolve erro com as pendências.

## Testes

- **Deno** (`bun run test:edge`): mapeamento de status, base URL por prefixo, Basic auth,
  normalização de `requirements`, `buildCreateRecipientBody`, `redactRecipientBody`, `parseSyncInput`,
  `MockGateway`.
- **pgTAP** (`bun run test:db`): tabelas/enum, default de `take_rate_bps`, unique `(company,provider)`,
  RLS (operator só lê o próprio e não escreve; hub_admin full).
- **Vitest**: `payouts/status.ts` + `RecipientPanel` (gating + estados).

## Coleta de KYC do recebedor (E1.3) — formulários do parceiro

O Pagar.me exige, para criar o recebedor PJ, um `register_information` completo + `default_bank_account`.
Os campos são coletados na **UI da Movepark** (ADR-004), distribuídos assim:

- **Onboarding 1 (lead, `/seja-parceiro`)** — mantido **leve**: só máscara/validação de **CNPJ** no
  campo que já existia (`tax_id`). Nenhum campo novo de KYC.
- **Onboarding 2 (wizard)** — **novo passo "Recebimento"** (`StepPayout`, passo 6; Revisão passou a 7).
  Coleta todo o KYC. É **opcional para o go-live** (o operador pode "Pular por enquanto"); estar apto
  a receber é rastreado por `payout_recipient.status`, separado do catálogo.
- **Manager** — `RecipientPanel` ganhou **"Editar dados (KYC)"** (`PayoutKycDialog`), reusando o mesmo
  formulário; o hub_admin grava direto pela RLS `admin_all`. O `CompanyForm` do Manager e o
  `Step1Company` também passaram a mascarar/validar o CNPJ.

**Modelo escolhido:** **PJ (corporation)**, **um representante legal** (managing_partner). Campos:

| Bloco | Campos |
|---|---|
| Empresa | razão social (`trading_name`), nome fantasia (`company_name`), CNPJ, tipo societário (`corporation_type`), e-mail, telefone, faturamento anual (`annual_revenue`), data de fundação (`founding_date`) |
| Endereço da empresa | CEP, rua, número, complemento, bairro, cidade, UF, ponto de referência |
| Representante legal | nome, CPF, e-mail, telefone, nascimento, renda mensal, ocupação, nome da mãe, **declaração de representante legal** (`self_declared_legal_representative`) + endereço do representante |
| Conta bancária | banco, agência (+dígito), conta + dígito, tipo (corrente/poupança), titular |

**Fonte única de validação:** `src/features/payouts/kyc.ts` (schema Zod, pt-BR; CNPJ/CPF com dígito
verificador, datas, CEP, telefone). Máscaras puras em `src/lib/masks.ts`; validação de documentos em
`src/lib/documents.ts`. O form reutilizável é `PayoutKycForm` (react-hook-form + zodResolver).

**Persistência:** colunas planas de banco/identidade em `company_payout_account` + **`kyc_details` (jsonb)**
com o restante do `register_information` (endereço, telefone, faturamento, fundação, tipo societário,
representante). Dinheiro é guardado em **reais** (inteiro). Escrita pelo operador via RPC
`onboarding_upsert_payout_account` (guarda `onboarding_assert_editable` + bump do passo 6); pelo
hub_admin direto na tabela (RLS). O adapter `pagarme.ts` monta o `register_information` (corporation,
`main_address`, `phone_numbers`, `managing_partners[0]`) a partir do `kyc_details` na hora de criar o
recebedor (`founding_date` convertido para `YYYY-MM-DD`).

## Cobrança PIX com split (E0.1.2)

Migration `20260629000000_pix_charges.sql`: colunas em `payment` (`method`, `pix_qr_code`,
`pix_qr_code_url`, `expires_at`, `split` jsonb), `app_setting.pagarme_movepark_recipient_id`
(editável no Manager → Configurações → Pagamentos) e `payment_webhook_event` (idempotência, só
service_role).

**Fluxo:**
1. Cliente no checkout → Edge **`create-pix-charge`** (JWT). Carrega a reserva (dona, pendente, não
   expirada), o recebedor do parceiro (`payout_recipient.external_recipient_id`, precisa existir) e o
   `company.take_rate_bps`.
2. **Split** (`_shared/payments/split.ts`, puro/testado): comissão = `round(total * take_rate_bps/10000)`
   → recebedor master da Movepark; restante → recebedor do parceiro. **O parceiro absorve as taxas**
   (`liable`/`charge_processing_fee`/`charge_remainder_fee` = true na perna dele; Movepark = false).
   `type: "flat"` em centavos; a soma é sempre o total. Comissão 0 → só a perna do parceiro.
3. `getGateway("pagarme").createPixCharge(...)` → `POST /orders` com `payments[].pix` (`expires_in`)
   + `payments[].split[]`. Grava `payment` (provider=pagarme, `provider_payment_id`=order id, QR,
   `expires_at`, snapshot do split) e devolve `qr_code` (copia-e-cola) + `qr_code_url`.
4. Front: aba **PIX** do `Step3Payment` gera a cobrança real e renderiza o QR (via `lib/qr`); cartão
   segue no `mock-payment` até a E0.1.3.

> **Validade do QR = janela de hold (E0.3.1-a, ADR-005).** A validade do QR (`expires_in`) deixou de
> ser fixa em 1 h e passa a ser **a config única** `app_setting.booking_hold_minutes` (default 30,
> via `get_booking_hold_minutes()`), a **mesma** que governa `booking.expires_at`. Gerar o
> PIX/cartão **renova** `booking.expires_at = now() + hold`, então o hold sempre cobre a validade do
> QR, e acaba o desencontro que deixava dinheiro capturado sem vaga. Ver
> [booking-flow.md](./booking-flow.md).
>
> **Vale para as quatro cobranças desde 11/09/2026.** `create-fare-upgrade` e
> `change-booking-dates-paid` tinham ficado para trás, com `PIX_EXPIRES_IN_SECONDS = 3600` cravado
> no arquivo. Na troca de datas isso não era cosmético: o `payment.expires_at` que sai de lá é o que
> o cron `expire-date-change-holds` usa para soltar a vaga nova, então o QR e o hold da vaga eram
> dois relógios diferentes. A conversão vive em `_shared/payments/hold.ts`
> (`pixExpiresInSeconds`), que espelha a faixa da RPC (5 a 1440 minutos, default 30) para uma RPC
> sem resposta não virar `NaN` no `expires_in` da cobrança.

> **Recebedor master da Movepark:** configurável em `app_setting.pagarme_movepark_recipient_id`
> (Manager). Use o de staging agora; trocar para produção é só editar o valor.

### Webhook de status (E0.1.2/.4)

Edge **`pagarme-webhook`** (`verify_jwt=false`, deploy com `--no-verify-jwt`): valida **Basic auth**
(secret `PAGARME_WEBHOOK_BASIC_AUTH` = `user:pass`, configurado no painel do Pagar.me) com **comparação
em tempo constante** e **fail-closed em produção** (`isProductionKey()`: qualquer chave que não seja
`sk_test_` exige o secret; sem ele → 401. Em staging `sk_test_` continua opcional. A checagem nasceu
como `startsWith("sk_live_")`, prefixo que a Core v5 não usa, e deixava o webhook aberto em produção).
**Idempotência** por id do evento (`payment_webhook_event`),
casa o `payment` por `provider_payment_id` (order id, ou `metadata.booking_id`) e decide a ação pelo
**TIPO do evento** via `webhookIntentFromType()` — **não** pelo `data.status` (num estorno de PIX a
Pagar.me manda `charge.refunded` com `data.status:"paid"`; confiar no status fazia o estorno nunca
refletir). `charge.paid`/`order.paid` → `payment.paid` + confirma via **`confirm_or_refund_booking`** (E0.3.1-a:
reconfirma se há vaga, senão estorna automático no **caso 4c** — pago sobre reserva já expirada;
idempotente, `noop` se já `confirmed`);
`charge.refunded` → `payment.refunded` (**sem** cancelar o booking — estorno ≠ cancelamento);
`charge.partial_canceled` → registra `refunded_amount`. Idempotência **resiliente** por `processed_at`
(evento que falhou reprocessa na reentrega). **Redes de segurança:** Edge **`reconcile-refunds`** (cron
15 min) recupera estornos pendentes cujo webhook nunca chegou, e **`reconcile-confirmations`** (cron
15 min) recupera confirmações perdidas (pago sem vaga → reconfirma ou estorna). O polling do checkout
(`useCheckoutBooking`) detecta a confirmação no banco.

> **`authorized` populado (E0.3.1-a).** O `mapChargeStatus` passa a emitir **`authorized`** para
> cartão em análise/antifraude (`authorized`/`analyzing`/`in_analysis`/`pending_review`) — habilita a
> blindagem do cron (ADR-005): `payment.status = authorized` = dinheiro comprometido, o cron não
> expira. **PIX ocioso** (`waiting_payment`) permanece em `pending` e continua expirando.

**Emissão do voucher no `pago` (E0.1.4):** ao confirmar, o webhook **pré-gera o voucher** com service
role e persiste `booking.voucher_url`, sem segurar o 2xx (`EdgeRuntime.waitUntil`). A geração do PDF
mora em `_shared/voucher/` (`fields.ts` puro + `pdf.ts` com `buildVoucherPdf`/`generateAndStoreVoucher`),
**reutilizada** pela Edge `voucher-pdf` (download sob demanda, leitura RLS pelo dono/operador). Falha de
voucher é logada e **não** derruba o webhook (status já refletido).

**Cartão salvo (`card.*`), desde 11/09/2026.** Os eventos chegavam e caíam no vazio: 29 recebidos,
nenhum tratado. `card.deleted` marca `payment_method.deleted_at`, porque cartão morto no gateway
que continua na nossa lista faz o cliente escolher no checkout algo que a cobrança vai recusar;
`card.updated` atualiza bandeira, fim e validade, e só sobrescreve o que veio no payload;
`card.created` é ignorado de propósito (o cartão salvo nasce em `create-card-charge`, com o id lido
da resposta da própria cobrança). Tipo desconhecido não vira escrita cega.

**Idempotência de verdade em todos os ramos.** `recipient.*`, `transfer.*` e os casos de "não
casou" retornavam sem gravar `processed_at`, então a idempotência ali era nominal: numa reentrega o
evento era reprocessado inteiro. Agora todo caminho que decidiu alguma coisa carimba o evento; só
falha de escrita (que devolve 500 e pede reentrega) segue sem carimbo.

**Setup:** cadastrar a URL do webhook + Basic auth no painel do Pagar.me e setar o secret.

### Estorno / refund (E0.3.2)

`refundCharge` na interface `PaymentGateway` → `PagarmeGateway` faz `DELETE /charges/{chargeId}` (body
`{ amount }` só no parcial; aqui sempre **total**). **Não** reenvia split — a Pagar.me reverte
proporcionalmente. O `provider_charge_id` é gravado na criação da cobrança (`create-pix-charge`); a Edge
resolve via `getCharge(orderId)` como fallback. A orquestração mora na Edge **`cancel-booking`**
(dono ou staff; política por ator — ver `booking-flow.md`). O **webhook** `charge.refunded` confirma:
reflete `payment.refunded` (com `refunded_at`/`refunded_amount` via `coalesce`, preservando o que a Edge
marcou) e chama a RPC idempotente `cancel_booking_with_release`. Colunas novas em `payment`:
`provider_charge_id`, `refunded_amount`, `refunded_at`, `refund_reason` (migration `20260630000000`).

### Cartão de crédito + parcelamento (E0.1.3)

**Cobrança** `createCardCharge` na interface → `PagarmeGateway.buildCardOrderBody` monta `POST /orders`
com `payments[0] = { payment_method:"credit_card", credit_card:{ installments, statement_descriptor,
card:{token} | card_id, split[] } }`. **Tokenização é client-side** (`src/lib/pagarme-tokenize.ts` →
`POST api.pagar.me/core/v5/tokens?appId=<pk>`): o PAN **nunca** toca nosso backend; trafegamos só o token
(single-use) ou o `card_id` (cartão salvo).

**Parcelamento — política dinâmica (resolve a Q-001):** vive em `app_setting.card_installment_policy`
(JSON), editável no **Manager → Configurações → Pagamentos** sem code change: `enabled`, `maxInstallments`,
`interestFreeUpTo`, `monthlyInterestPct` (PMT/Price), `minInstallmentCents`, `absorb`
(`customer` = juros no preço | `movepark`/`partner` = preço fixo). A lógica pura
`computeInstallmentPlan` vive em `_shared/payments/installments.ts` (verdade) com **espelho** em
`src/lib/installments.ts` (exibição) e teste de paridade. **Server-authoritative:** a Edge
**`create-card-charge`** revalida a parcela escolhida e **recalcula** o valor financiado — o cliente nunca
informa o valor.

**Split com juros:** `buildSplit({ chargedCents, baseCents, ... })` — o parceiro recebe sempre sobre o
**preço base** (`baseCents − comissão`); o **excedente** (juros, quando `absorb=customer`) vai pra
Movepark. PIX passa `chargedCents == baseCents` → comportamento idêntico. Invariante: soma do split ==
valor cobrado.

> **Juros de 2,99% a.m. acima de 3x, desde 11/09/2026** (migration
> `20261114120000_parcelamento_com_juros_acima_de_3x.sql`). A política estava em
> `monthlyInterestPct: 0` com `maxInstallments: 12`, `interestFreeUpTo: 3` e `absorb: 'customer'`,
> combinação que dizia cobrar juros do cliente e não cobrava de ninguém: eram 12x sem juros, com o
> custo de parcelamento caindo na Movepark, e o `interestFreeUpTo` como config morta. Nunca doeu
> porque nunca houve venda no cartão, mas era o que estava armado para a primeira. O default das
> duas cópias de `installments.ts` subiu junto, para a política sumir do banco e o comportamento
> não regredir, e um guarda nos dois espelhos (mais o pgTAP `card_installment_policy.test.sql`
> sobre o valor gravado) reprova a combinação inerte. A taxa segue editável no Manager.
>
> **O `absorb` promete mais do que entrega.** Só `customer` muda alguma coisa: `movepark` e
> `partner` se comportam igual, porque nada no código reduz a perna do parceiro pelos juros.
> Decidido em 11/09/2026 manter os três valores e registrar aqui, em vez de implementar o desconto
> no parceiro (que seria mudança de contrato comercial) ou remover o valor.

**Config pública:** a Edge **`get-payment-config`** (sem auth, service_role) devolve `{ public_key,
installment_policy }` — o `app_setting` é bloqueado por RLS pro consumidor. **Cartão salvo:** opt-in no
checkout grava `payment_method` (provider=pagarme, `card_id`, brand/last4 — nunca PAN). Coluna nova:
`payment.installments` (migration `20260702000000`).

### Reconciliação do split + extrato de repasses (E0.3.3)

**Reconciliação INTERNA** (nossos registros, confirmada pelos webhooks — sem Balance API). A RPC
**`payout_statement(p_from, p_to, p_company_id?, p_include_lines?)`** (SECURITY DEFINER; hub_admin → todas,
operator → só as suas, senão `42501`) deriva o repasse do snapshot `payment.split`: o **parceiro** é a perna
`liable=true`, a **Movepark** `liable=false` (robusto, não depende do `app_setting`). Por empresa/período
(`coalesce(paid_at, refunded_at)`): `gross_partner` (paid+refunded), `refunded_partner`, `net_partner`
(= só paid), `movepark_commission`. **`payout_balance(company)`** = líquido − saques pagos. Exclui
`provider='mock'`. Tudo em **centavos** (o front divide por 100). Surface: hooks `usePayoutStatement`/
`usePayoutBalance`/`usePayoutWithdrawals` + view **Manager → Repasses** (`finance/payouts`); o painel do
parceiro + NFs é a E1.5.2.

**Saques reais:** tabela **`payout_withdrawal`** (RLS: operator lê o seu, escrita só service_role)
alimentada pelos eventos **`transfer.*`** do Pagar.me no `pagarme-webhook` (upsert idempotente por
`(provider, external_transfer_id)`; casa empresa por `external_recipient_id`). **Diluir a taxa** (R$3,67,
`app_setting.payout_withdrawal_fee_cents`): `transfer_settings` (cadência agregada) no recebedor.
**Correção:** o webhook deixou de zerar `paid_at` em estorno (preserva a data do pagamento para a
reconciliação por período). Migration `20260703000000`.

**Config de repasse POR EMPRESA (E0.3.3, migration `20260729000000`).** A cadência de transferência
(`Daily/Weekly/Monthly` + dia + on/off) e a **antecipação automática** deixam de ser só globais:
viram **colunas em `payout_recipient`** (`transfer_*`, `anticipation_*`; **NULL = herda** o default
global do `app_setting` — `payout_transfer_*` / novos `payout_anticipation_*`). O valor **efetivo**
(`coluna ?? global ?? hard`) é resolvido em `_shared/payments/payoutConfig.ts` e aplicado no
recebedor: no **create** pelo `sync-recipient`, e no **update** pela Edge nova **`update-recipient-payout`**
(hub_admin) → `gateway.updateTransferSettings` / `updateAnticipationSettings`
(PATCH `/recipients/{id}/transfer-settings` e `/automatic-anticipation-settings`, ADR-004; mock no-op).
UI: botão **Configurar repasse** no `RecipientPanel` (Manager → Recebedores). **Antecipação** aparece
mas **desabilitada** — a Pagar.me exige **liberação prévia** da conta. `take_rate_bps` segue por empresa
na `company`.

**Default global vigente (jul/2026): transferência automática DESLIGADA**, Mensal/dia 1
(`app_setting.payout_transfer_enabled = 'false'`). O recebedor do parceiro **nasce sem repasse
automático**: o saldo fica na Pagar.me e sai por **saque** (`payout_withdrawal`, escopo
`payouts:write`, exclusivo do Dono). O `PayoutSettingsDialog` **espelha** esse default no fallback do
formulário — ao mudar o global, mude o espelho no mesmo PR, senão abrir o diálogo de uma empresa
herdeira e salvar sem tocar em nada **religa** a transferência.

**Armadilha:** o `PATCH /recipients/{id}/transfer-settings` responde **404 "Recipient not found"**
enquanto o recebedor está em `affiliation` (KYC em análise) — só aceita alteração depois de `active`.
Por isso a cadência que vale é a enviada **no create**; recebedor criado com o default errado precisa
ser corrigido quando virar `active`.

## Tarifa de flexibilidade como receita Movepark (E2.8)

A **Tarifa** (Básica/Flex/Superflex — ver [fares.md](./fares.md)) é **receita de serviço da Movepark**,
**fora do split da vaga**: nunca toca o `take_rate` nem o repasse do parceiro. O roteamento reusa o
mecanismo de **excedente** do `buildSplit`: `create-pix-charge` e `create-card-charge` descontam
`booking.fare_price_cents` do **base do parceiro** (`baseCents = total − tarifa`) e cobram o total
(`chargedCents = total [+ juros]`), de modo que a tarifa cai inteira na **perna da Movepark**
(junto com a comissão e o excedente de juros). Invariante mantida: soma do split == cobrado.

## Fora de escopo (próximas subtarefas)

3DS com challenge/redirect (assume cartão sem challenge nesta fase), **estorno parcial**
(interface/coluna já prontos), `api_cancel_booking` (public API) ainda sem refund, trigger automático de
criação do recebedor ao concluir o KYC, e o `base64_qrcode` da prova de vida (hoje exibimos só a `url`).
