# Reserva por agente (chatbot de WhatsApp) - Spec

> Um agente de IA (a começar por um chatbot de WhatsApp) conduz a reserva como o site conduz: busca,
> compara, oferta, monta o pedido, coleta os dados do pagador e entrega um **link de checkout que já
> cai logado** direto no passo de pagamento. O usuário só escolhe a forma de pagamento, paga e recebe
> o voucher. O pagamento acontece no checkout web, nunca dentro da conversa.
>
> Extensão do MCP (ver [mcp.md](../mcp.md)) e do assistente web (ver [chatbot.md](../chatbot.md)).
> Fonte de verdade das tools de leitura: `supabase/functions/_shared/assistant-tools.ts`.

---

## 1. Objetivo e limite

O MCP hoje tem duas superfícies: consumidor anônimo (só descoberta) e parceiro (chave `mp_` de
empresa, escopo B2B). Nenhuma reserva em nome de um usuário final. Esta spec adiciona a superfície de
**consumidor autenticado** e o **handoff de checkout**, de modo que um agente feche a reserva de ponta
a ponta.

O limite é deliberado: o agente leva até o pagamento e entrega um link. Pagar com cartão exige
tokenização no browser (o PAN nunca passa pelo backend, ADR-004), e um agente headless que recebesse
cartão colocaria PAN e CVV no transcript da conversa. Inviável por PCI. Então o pagamento fica no
checkout web, que já resolve PIX e cartão.

---

## 2. Decisões

| Tema | Decisão |
|---|---|
| Onde o link cai | Direto no passo de pagamento. O agente coleta CPF, telefone, placa e aceite dos Termos na conversa |
| Quem chama o MCP de consumidor | Superfície pública, qualquer agente |
| Autenticação | OTP na conversa (superfície pública) e identidade afirmada por chamador confiável (nosso bot) |
| Pagamento | Fora do MCP. PIX e cartão seguem só no checkout web |

### 2.1 Por que dois caminhos de autenticação

"Confiar no número que o WhatsApp entrega" e "superfície pública" não convivem no mesmo endpoint: num
MCP público, qualquer chamador poderia afirmar o número de outra pessoa e receber a sessão dela. O
desenho separa por confiança no chamador:

- **`/customer` público (qualquer agente):** autentica só por **OTP**. O usuário prova posse do
  identificador. É a superfície que vai no card e na doc.
- **`/customer` com chamador confiável (chave `mp_` da própria Movepark + escopo `identity:assert`):**
  pode afirmar um identificador já verificado pelo canal, sem OTP. É por aqui que o nosso bot de
  WhatsApp usa o número que a Meta já verificou.

Mesmas tools nas duas; só o caminho de autenticação muda.

---

## 3. Arquitetura

```
Agente (chatbot WhatsApp / Claude / etc.)
   │  POST JSON-RPC  (Authorization: Bearer <JWT do usuário>  a cada chamada)
   ▼
mcp.movepark.co/customer   ← 3ª superfície da Edge mcp (verify_jwt=false)
   │   login por OTP  |  chamador confiável afirma identidade
   ▼
tools de leitura (anon)  +  tools transacionais (repassam o JWT às Edges de consumidor)
   │
   ▼
create-booking, accept-terms, lookup-vehicle-plate, ...  (RLS do dono revalida)
```

O MCP segue **stateless**: o agente guarda os tokens e manda `Authorization: Bearer <JWT>` a cada
chamada, igual ao que a Edge `chat` já faz (`chat/index.ts`, repasse com `fetch` cru e headers
`apikey` + `Authorization`).

O "carrinho" não existe como tabela: a `booking` nasce no banco com `status=pending` e `expires_at` já
na criação. O identificador do pedido na conversa é o `booking_code`.

---

## 4. Autenticação de consumidor

O supabase-js só embrulha os endpoints REST do GoTrue (`/auth/v1/otp`, `/auth/v1/verify`); nada neles
é específico de browser, então rodam server-side. Definições e mapeamento canal→GoTrue em
`supabase/functions/mcp/customer.logic.ts`; handler em `mcp/index.ts` (`callCustomer`).

| Tool | Faz | Status |
|---|---|---|
| `request_login_otp({ identifier, channel })` | Dispara OTP por WhatsApp ou e-mail (`signInWithOtp`) | ✅ no ar |
| `verify_login_otp({ identifier, channel, code })` | Troca o código por `access_token` + `refresh_token` (`verifyOtp`) | ✅ no ar |
| `whoami()` | Retorna o usuário do JWT corrente, ou não autenticado | ✅ no ar |
| `assert_verified_identity({ channel, identifier })` | Chamador confiável (chave `mp_` + escopo `identity:assert`) afirma identidade verificada pelo canal, sem OTP | adiada |

`channel` ∈ `whatsapp` (verifica com `type: "sms"`) ou `email`. `verify_login_otp` devolve os tokens
para o agente agir em nome do usuário; o usuário consentiu ao passar o código.

Rate limit no `handleMcp` do worker (`src/api-worker.ts`): a superfície `/customer` freia por IP no KV
`API_RATELIMIT` (o `request_login_otp` dispara mensagem com custo). O GoTrue ainda limita OTP por
identificador. ✅ no ar.

**`assert_verified_identity` foi adiada de propósito.** É a capacidade mais poderosa do desenho (cria
sessão sem OTP) e só tem uso junto do bot de WhatsApp, que ainda não existe. Exige escopo novo
`identity:assert` no catálogo `api_scope` e verificação de chave `mp_` na superfície `/customer`. Será
construída junto da integração do bot, não antes: uma tool que mina sessão de qualquer telefone não
deve existir sem consumidor.

---

## 5. Tools transacionais de consumidor

`CUSTOMER_TOOLS = [...READ_TOOLS, ...CUSTOMER_ONLY_TOOLS]`, reusando o registro compartilhado de
leitura. As transacionais repassam o JWT do usuário às Edges, que revalidam o dono por RLS.

| Tool | Substrato | Nota |
|---|---|---|
| `create_booking` | Edge `create-booking` | Já existe. Segura a vaga (`status=pending`) |
| `set_booking_customer` | update em `booking` | `customer_tax_id`, `customer_phone`, `customer_email`, nomes |
| `accept_terms` | Edge `accept-terms` | Ver ressalva jurídica (§8) |
| `lookup_plate` | Edge `lookup-vehicle-plate` | API externa **paga**: rate limit próprio |
| `add_vehicle` | insert em `vehicle` | |
| `set_booking_vehicle` | update em `booking` | |
| `list_my_bookings` / `get_booking` | query `booking` sob RLS | |
| `cancel_booking` | Edge `cancel-booking` | |
| `get_booking_status` | query `booking` + `payment` | Evita o agente dar poll em tabela crua |

Ficam **fora** por decisão: `delete-account` (irreversível), `attach-phone-silent` (identidade), e
tudo de pagamento.

---

## 6. Handoff de checkout (link que cai logado)

O agente autenticou o usuário (via OTP) e criou a reserva. O link leva o usuário ao checkout web já
logado, direto no passo de pagamento.

### 6.1 Token de handoff

Molde: ciclo de vida do `identifier_otp`, forma do segredo do `api_key`. Tabela `checkout_handoff`:

```
id, token_prefix (unique, indexado), token_hash (sha256 hex),
profile_id, booking_id, refresh_token, expires_at, consumed_at, created_at
```

- RLS ligada e **zero policies** (só service_role toca), como `identifier_otp`.
- TTL curto (15 min), uso único.
- Consumo **atômico**: `update ... set consumed_at = now() where id = ? and consumed_at is null
  returning *`.
- Purge por pg_cron.
- RPC `checkout_handoff_verify` security definer retornando `{ ok, reason, ... }`, espelhando
  `api_key_verify`.

### 6.2 Como a sessão se materializa

Não há precedente no repo: nada chama `setSession` nem `verifyOtp({ token_hash })`, e
`admin.generateLink` é email-only no GoTrue (um usuário de WhatsApp pode não ter e-mail). O MCP já tem
a sessão do usuário (OTP em §4); ao criar o handoff, guarda o `refresh_token`. O resgate devolve o par
de tokens uma única vez e o front chama `supabase.auth.setSession()`. Só comportamento existente do
GoTrue.

- Edge `create-checkout-handoff` (JWT do usuário) devolve a URL.
- Edge `redeem-checkout-handoff` (anon) valida e devolve os tokens.
- O segredo viaja no **fragment** (`#ht=`), não em query string, para não vazar em log nem `Referer`.

### 6.3 Deep-link para o passo de pagamento

O passo do checkout hoje é `React.useState<CheckoutStep>(1)` fixo (`src/routes/checkout.tsx`), não lê
URL. Mudanças:

1. Função pura `resolveInitialStep(booking, requestedStep)` ao lado de `resolveCheckoutGate`
   (`src/features/checkout/checkout.logic.ts`). **Deriva do estado do booking, não confia no param**:
   só libera o passo 3 se os campos bloqueantes estão preenchidos e o aceite existe.
2. `checkoutNext()` preserva a query string ao montar o `next=` do redirect de login.
3. Decidir o "Voltar" do passo 3 (hoje `setStep(2)`, que cairia num passo 2 vazio).
4. Limpar o fragment após o resgate.

`isCheckoutBlocked` já cobre reserva expirada antes do switch de passos, então um link velho nunca
chega ao pagamento.

---

## 7. Fluxo ponta a ponta (PIX)

| # | Passo | Como | Auth |
|---|---|---|---|
| 1 | Autenticar | `request_login_otp` + `verify_login_otp` | gera JWT |
| 2 | Buscar e precificar | `search_parking`, `simulate_price`, `get_availability` | anon |
| 3 | Criar reserva | `create_booking` (segura a vaga) | JWT |
| 4 | Dados do pagador | `set_booking_customer` (CPF e telefone com DDD são obrigatórios) | JWT |
| 5 | Placa | `lookup_plate` / `add_vehicle` / `set_booking_vehicle` | JWT |
| 6 | Aceite dos Termos | `accept_terms` (ver §8) | JWT |
| 7 | Gerar link | `create-checkout-handoff` → URL | JWT |
| 8 | Pagar | Usuário abre o link, cai logado no passo 3, paga PIX no site | sessão do handoff |
| 9 | Confirmar | `get_booking_status` até `confirmed`; voucher gerado pelo webhook | JWT |

---

## 8. O que bloqueia o pagamento (server-authoritative)

As Edges de pagamento leem só o snapshot do `booking` e recusam sem:

| Campo | PIX | Cartão |
|---|---|---|
| linha em `terms_acceptance` | 422 | 422 |
| `customer_tax_id` (CPF/CNPJ válido) | 422 | 422 |
| `customer_email` | 422 | 422 |
| `customer_phone` com DDD | 422 | não lido |
| `status=pending` e `expires_at` futuro | 400 | 400 |

`vehicle_id` **não** bloqueia o pagamento (nenhuma Edge de pagamento o lê); o bloqueio do passo 2 é só
de UI. A placa ainda importa na portaria e no voucher, então o agente deve coletá-la.

**Ressalva jurídica sobre `accept_terms`:** `terms_acceptance` é prova de conformidade LGPD com versão,
timestamp e IP. Registrar o aceite a partir de uma conversa muda a natureza da evidência. Para valer, o
agente precisa apresentar o texto ou o link dos Termos e obter afirmação explícita. Validar com o
jurídico antes de implementar. Se não passar, o link cai no passo 1 só para o aceite.

---

## 9. Segurança e riscos

1. **Aceite de Termos pelo agente** (§8) depende de aval jurídico.
2. **Tokens de usuário a um cliente MCP público** é consequência de a superfície ser pública. Mitigar
   com TTL curto, rate limit e revogação de sessão.
3. **`lookup_plate` bate em API externa paga.** Sem rate limit por usuário, vira vetor de custo.
4. **`create_booking` segura capacidade real** ao criar o `pending`. Um agente com bug pode esgotar
   inventário. O cron de expiração cobre, mas vale limitar reservas pendentes por usuário.
5. **Pré-requisito fechado:** o `attach-phone-silent` promovia telefone a credencial sem OTP, o que
   viraria porta de sequestro com login por WhatsApp. Corrigido: virou dica não-credencial (migration
   `20260820000000`, RPC `set_phone_hint`). Ver ADR-006 no `CLAUDE.md`.

---

## 10. Fases e status

- **F0 - Registro único de tools + guard + OpenAPI** - ✅ no ar. `_shared/assistant-tools.ts`
  (registro canônico de leitura, consumido por MCP e chat), drift guard cobrindo as três superfícies
  em ambas as direções, `openapi.yaml` parseando. `current_datetime` entrou no MCP consumidor.
- **Pré-requisito de segurança** - ✅ no ar. Telefone do checkout deixou de virar credencial.
- **F1 - Autenticação de consumidor no MCP** - ✅ no ar (caminho OTP). Superfície `/customer` com
  descoberta + `request_login_otp`/`verify_login_otp`/`whoami`, rate limit por IP na borda.
  `assert_verified_identity` (chamador confiável) adiada para junto do bot (§4).
- **F2 - Tools transacionais** - planejado (§5).
- **F3 - Handoff de checkout** - planejado (§6).
- **F4 - Superfície, doc e descoberta** - planejado. Terceiro branch de endpoint na Edge `mcp`,
  `customer-card.json`, atualização de `api-catalog`/`llms.txt`/`auth.md`.

---

## 11. Testes

- deno: invariante `isToolCallable` consistente com `listTools` nas três superfícies; login e tools
  transacionais.
- pgTAP `checkout_handoff.test.sql`: uso único sob concorrência, expiração, guarda de tenant, grants.
- Vitest `resolveInitialStep`: recusa passo 3 sem CPF, sem aceite, com reserva expirada.
- e2e após deploy: OTP entrega, handoff cai logado no passo 3, reuso do link falha, TTL expira,
  `assert_verified_identity` negado na superfície pública sem chave.
