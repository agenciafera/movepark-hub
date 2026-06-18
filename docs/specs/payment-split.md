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

## Por que um estado próprio de "ficha para receber"

`company.onboarding_status` (`pending_review→approved→in_progress→active→rejected`) é sobre
**publicar no catálogo** (go-live). Estar **apto a receber** é outro concern (análise do gateway,
KYC, dados bancários) — por isso tem ciclo próprio em `payout_recipient.status`. Uma empresa pode
estar `active` no catálogo e ainda `pending`/`action_required` para receber.

## Modelo de dados (migration `20260627000000_payout_recipients.sql`)

Separa três conceitos:

| Tabela / coluna | Concern | Agnóstico ao gateway? |
|---|---|---|
| `company.take_rate_bps` | Comissão da Movepark retida no split (basis points; default global `app_setting.default_take_rate_bps` = `1500` = 15%). Por **empresa**. | ✅ |
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
  Core v5 `api.pagar.me`; o ambiente teste/produção é definido pela **chave** `sk_test_`/`sk_live_`,
  não por host — `sdx-api` é da skill de Checkout e **não** atende a Core v5), `pagarmeAuthHeader`
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

- `api.ts` — `useRecipient(companyId)`, `useSyncRecipient()` (invalida `payoutKeys.all`).
- `status.ts` — `payoutStatusLabel`/`payoutStatusTone` (espelha `onboarding/status.ts`).
- `RecipientPanel.tsx` — badge de status, link de verificação, lista de pendências e botão
  **Criar/Sincronizar recebedor**; embutido no `ApplicationDrawer` quando o parceiro está
  `approved`/`in_progress`/`active`.

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

> **Recebedor master da Movepark:** configurável em `app_setting.pagarme_movepark_recipient_id`
> (Manager). Use o de staging agora; trocar para produção é só editar o valor.

### Webhook de status (E0.1.2/.4)

Edge **`pagarme-webhook`** (`verify_jwt=false`, deploy com `--no-verify-jwt`): valida **Basic auth**
(secret `PAGARME_WEBHOOK_BASIC_AUTH` = `user:pass`, configurado no painel do Pagar.me) com **comparação
em tempo constante** e **fail-closed em produção** (chave `sk_live_` exige o secret; sem ele → 401.
Em staging `sk_test_` continua opcional). **Idempotência** por id do evento (`payment_webhook_event`),
casa o `payment` por `provider_payment_id` (order id, ou `metadata.booking_id`) e reflete o status:
`order.paid`/`charge.paid` → `payment.paid` + `booking.confirmed` (só se pendente); refunded/failed/canceled
refletem no `payment`. O polling do checkout (`useCheckoutBooking`) detecta a confirmação no banco.

**Emissão do voucher no `pago` (E0.1.4):** ao confirmar, o webhook **pré-gera o voucher** com service
role e persiste `booking.voucher_url`, sem segurar o 2xx (`EdgeRuntime.waitUntil`). A geração do PDF
mora em `_shared/voucher/` (`fields.ts` puro + `pdf.ts` com `buildVoucherPdf`/`generateAndStoreVoucher`),
**reutilizada** pela Edge `voucher-pdf` (download sob demanda, leitura RLS pelo dono/operador). Falha de
voucher é logada e **não** derruba o webhook (status já refletido).

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

**Config pública:** a Edge **`get-payment-config`** (sem auth, service_role) devolve `{ public_key,
installment_policy }` — o `app_setting` é bloqueado por RLS pro consumidor. **Cartão salvo:** opt-in no
checkout grava `payment_method` (provider=pagarme, `card_id`, brand/last4 — nunca PAN). Coluna nova:
`payment.installments` (migration `20260702000000`).

## Fora de escopo (próximas subtarefas)

3DS com challenge/redirect (assume cartão sem challenge nesta fase), **estorno parcial**
(interface/coluna já prontos), `api_cancel_booking` (public API) ainda sem refund, trigger automático de
criação do recebedor ao concluir o KYC, e o `base64_qrcode` da prova de vida (hoje exibimos só a `url`).
