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
| `assert_verified_identity({ phone })` | Chamador confiável (chave `mp_` + escopo `identity:assert`) afirma telefone verificado pelo canal, sem OTP | ✅ no ar (01/10/2026) |

`channel` ∈ `whatsapp` (verifica com `type: "sms"`) ou `email`. `verify_login_otp` devolve os tokens
para o agente agir em nome do usuário; o usuário consentiu ao passar o código.

Proteção contra abuso de OTP (mensagem tem custo), em duas camadas:
- **Dura, por identificador:** o GoTrue recusa um novo OTP pro mesmo destino por ~60s (verificado em
  produção: "you can only request this after 59 seconds"). É o que trava spam pro mesmo número.
- **Best-effort, por IP:** o `handleMcp` do worker freia as tools de OTP no binding `API_RATELIMIT`
  (60/min). O limite é atômico, mas vale por localidade da Cloudflare, então serve para spray entre
  muitos identificadores vindo de uma origem, não como limite rígido. E ele **falha aberto**: se o
  binding cair, a requisição passa e quem decide é o banco. Limite rígido e global (Durable Object)
  fica para E4.1. ✅ no ar.

  Foi um contador sobre KV até 12/08/2026, quando o próprio teste de flood que validava a camada do
  banco queimou a cota grátis de escrita e derrubou a Public API com 500. Ver o aviso em
  [`public-api.md`](../public-api.md) §10.

  **Chave por IP tem um furo conhecido, medido na validação de 12/08/2026:** com IP estável o freio
  barra a partir da 61ª chamada no minuto (75 tentativas ⇒ 61×`200` + 14×`429`), mas o mesmo burst
  saindo por IPv6 rotativo (WARP, VPN, operadora móvel) passa **inteiro**, porque cada requisição
  cai num balde diferente. Quem está atrás de proxy não é barrado aqui, e isso vale tanto para o
  usuário legítimo quanto para quem abusa. É mais uma razão para o freio de borda não ser tratado
  como defesa: o `otp_request_allowed` fecha por identificador, que o atacante não pode rotacionar
  de graça.

### 4.1 Identidade afirmada (`assert_verified_identity`)

É a capacidade mais poderosa do desenho (cria sessão sem OTP). Ficou adiada até existir o consumidor,
e entrou em 01/10/2026 junto da Mia (agente de WhatsApp da Movepark, no BeastBots), que fala com o
cliente por um número que a Meta já verificou.

**Quem pode chamar.** Só chave `mp_` da Movepark (`company_id is null`) com o escopo
`identity:assert`, mandada no header `X-API-Key` para `mcp.movepark.co/customer` (o path declarado:
na raiz, sem JWT, a resolução cai no perfil público). O escopo é de plataforma (`is_platform_scope`):
chave de empresa não o carrega, e só `hub_admin` o coloca numa chave. Sem a chave a tool nem aparece
no `tools/list`. Concedido à chave `Movepark-MIA` (live) em 01/10/2026.

**Como a sessão nasce.** O GoTrue não cria sessão de telefone sem OTP, então o caminho é o próprio
OTP, sem que ele saia do servidor:

1. a tool abre uma afirmação pendente (`identity_assertion_begin`, tabela `identity_assertion`,
   telefone em SHA-256, prazo de 30 s);
2. pede o OTP ao GoTrue (`signInWithOtp`, `shouldCreateUser: true`);
3. o GoTrue chama o Send SMS Hook (`send-whatsapp-otp`), que acha a afirmação aberta
   (`identity_assertion_capture`), guarda o código e **não** manda a mensagem;
4. a tool lê o código uma vez (`identity_assertion_take`, que o apaga) e troca por sessão
   (`verifyOtp`).

Tudo cabe numa requisição, porque o hook roda dentro do `signInWithOtp`. Se o hook não achar
afirmação (OTP comum de login), ele envia normalmente; se a consulta falhar, também envia (o login
comum nunca depende disto).

**Decisões de produto (Kallef, 01/10/2026):**
- Telefone sem conta: **cria a conta**, como o `request_login_otp` já faz. A conta nasce só com o
  telefone; o e-mail entra no checkout como dica (ADR-006), sem virar login.
- Telefone que já é login de uma conta com e-mail: **entra nessa conta**. Risco aceito: número
  reciclado pela operadora dá acesso à conta, o mesmo risco do login por OTP de WhatsApp.

**Contrato.** Entrada `{ phone }`, E.164 com ou sem `+`. Número do Brasil exige DDD e o nono dígito
(`55 DD 9XXXXXXXX`, 13 dígitos), senão o GoTrue veria outro telefone e criaria conta duplicada
(`normalizeAssertedPhone`). Saída igual à do `verify_login_otp`: `access_token` (1 h),
`refresh_token`, `expires_at`, `token_type` e `user: { id, new_account }`.

**Limites.** O GoTrue recusa um segundo código para o mesmo número em ~60 s, então quem afirma deve
guardar a sessão por conversa e renovar pelo `refresh_token`, e só afirmar de novo quando ela cair.
Freio no banco: 10 afirmações por telefone e 300 por chave, por hora; a recusa é registrada.

**Trilha.** `identity_assertion` guarda chave, hash do telefone, IP, status, conta resultante, se a
conta é nova e o erro. RLS sem policy (só as RPCs `service_role`). O código só existe entre o hook e
a leitura; o cron `prune-identity-assertion` apaga código esquecido e a trilha com mais de 180 dias.
Migration `20261128100000_identity_assert.sql`; pgTAP `identity_assertion.test.sql`.

**Validado em produção (01/10/2026)** com chave temporária e a conta de teste `peu+teste1@fera.ag`
(telefone verificado e e-mail): sem chave a tool é recusada; com chave a sessão sai na conta
existente (`new_account: false`), o código foi capturado e nenhuma mensagem foi enviada; a
repetição imediata bateu no freio de 60 s do GoTrue. Sessão encerrada e chave revogada no fim.

---

## 5. Tools transacionais de consumidor

`CUSTOMER_TOOLS = [...READ_TOOLS, ...CUSTOMER_AUTH_TOOLS, ...CUSTOMER_TXN_TOOLS]`. As transacionais
exigem `Authorization: Bearer <access_token>` (o handler recusa cedo, com mensagem amigável, se faltar).
`create`/`cancel` repassam o JWT às Edges; o resto é escrita/leitura direta sob a RLS do dono, o mesmo
caminho do checkout web. Definições em `mcp/customer.logic.ts`; handler `callCustomerTxn` em `index.ts`.

| Tool | Substrato | Status |
|---|---|---|
| `quote_booking` | RPC `quote_booking` (JWT) | ✅ no ar (01/10/2026). Total exato da reserva sem criá-la (§5.1) |
| `create_booking` | Edge `create-booking` (JWT) | ✅ no ar. Segura a vaga (`status=pending`) |
| `set_booking_customer` | update em `booking` (RLS) | ✅ no ar. `customer_tax_id`, `customer_phone`, `customer_email`, nomes |
| `add_vehicle` | insert em `vehicle` (RLS) | ✅ no ar. Cadastra pela placa, devolve `vehicle_id` |
| `set_booking_vehicle` | update em `booking` (RLS) | ✅ no ar |
| `list_my_bookings` / `get_booking` | query `booking` (RLS) + `my_booking_notifications` | ✅ no ar. Cada reserva traz `last_notification` (§5.2) |
| `get_booking_status` | `booking` + `payment` (RLS) | ✅ no ar. Evita o agente dar poll em tabela crua |
| `cancel_booking` | Edge `cancel-booking` (JWT) | ✅ no ar |
| `accept_terms` | Edge `accept-terms` (JWT) | F3 (ressalva jurídica, §8) |
| `lookup_plate` | Edge `lookup-vehicle-plate` (JWT) | F3 (API externa paga, rate limit próprio) |

**Decisão sobre `accept_terms`: não implementar.** O aceite dos Termos acontece no site, no passo 1 do
checkout. O link do handoff cai logado no passo 1 e o usuário aceita ali. Custa um toque e elimina o
risco jurídico de registrar aceite de LGPD a partir de uma conversa (§8). Consequência: o deep-link para
o passo de pagamento (`resolveInitialStep → 3`) fica inerte, já que exige o aceite; a função e os testes
seguem no código caso a decisão mude. `lookup_plate` continua pendente (API externa paga, quer rate
limit próprio); `add_vehicle` aceita a placa direto, então a reserva fecha sem ela.

Ficam **fora** por decisão: `delete-account` (irreversível), `attach-phone-silent` (identidade), e
tudo de pagamento.

### 5.0 Leitura com a sessão

No `/customer`, as tools de descoberta (`list_locations`, `get_parking_types`...) rodam com o JWT do
usuário quando ele vem, e não mais sempre anônimas. Motivo: a RLS de `location` mostra a unidade em
rascunho a quem é testador (`is_tester()`), e o agente que reserva em nome de um testador tem que
enxergar a mesma unidade que `quote_booking` e `create_booking` aceitam. JWT vencido ou inválido volta
para a leitura anônima, sem erro: a descoberta nunca depende de sessão. Validado em 01/10/2026: a
Agência Fera (rascunho) aparece para `peu+teste1` e some para o anônimo.

### 5.3 Sessão compartilhada com o link de checkout (medido em 01/10/2026)

O `create_checkout_link` guarda o `access_token` e o `refresh_token` do agente, e o navegador passa a
usar **a mesma sessão** do GoTrue. Medido em produção: reusar um `refresh_token` já rotacionado devolve
`refresh_token_already_used` para quem chegou atrasado, mas **não revoga a sessão** (o token vivo
segue valendo); reusar o pai cujo filho ainda não foi usado devolve sucesso. E um `logout` de qualquer
lado encerra a sessão dos dois. Recomendação ao agente: entregar a sessão ao link e parar de usá-la;
quando precisar de novo (acompanhar o pagamento), afirmar a identidade outra vez, o que abre uma
sessão independente.

### 5.1 Cotação (`quote_booking`)

O `simulate_price` recebe só o número de diárias: não conta a tolerância da unidade, não sabe da
tarifa (Flex/Superflex), do cupom, dos adicionais nem do desconto por antecedência, que depende da
data. O agente citava um valor e a reserva gravava outro. A `quote_booking` recebe os mesmos
argumentos do `create_booking` e roda o **próprio** `_create_booking_core` numa subtransação desfeita
no fim: o total é, por construção, o que a reserva gravaria, e as recusas (sem vaga, estadia mínima,
antecedência) saem com as mesmas mensagens. Não segura a vaga e não deixa rastro (nenhum trigger da
reserva chama rede de forma síncrona). Exige sessão, porque cupom tem limite por usuário. O que ainda
pode mudar depois é só o que o cliente escolhe no checkout: adicionais no passo 3 e juros do cartão
parcelado acima de 3x. Migration `20261128110000`; pgTAP `quote_booking.test.sql`. Validado em
produção em 01/10/2026 (Agência Fera: R$ 81,00 na Básica, R$ 93,90 na Flex).

### 5.2 Último aviso (`last_notification`)

Os avisos do Hub (confirmação, lembretes, alteração, extensão, cancelamento) saem pelo mesmo número
de WhatsApp do agente (phone_number_id `456610384191644`). Quando o cliente responde a um template, a
resposta cai na conversa do agente, que não sabia do envio. `list_my_bookings` e `get_booking` trazem,
por reserva, o último registro de `notification_log` (`event`, `channel`, `status`, `sent_at`), pela
RPC `my_booking_notifications`, que filtra por `auth.uid()` porque a RLS daquela tabela é só do
hub_admin. Só aviso que passou pelo `notify.ts` entra no log; o e-mail de confirmação tem trilho
próprio (`confirmation_email_sent_at`) e não aparece aqui.

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
6. **Session fixation do link de handoff (✅ mitigada).** O link loga o browser na conta que o **gerou**
   (propriedade de magic link). Com o MCP `/customer` público, um atacante podia autenticar a própria
   conta, reservar, gerar o link e enviá-lo a uma vítima; ao abrir, o browser da vítima virava a sessão
   do atacante (e, se pagasse, o cartão salvo ia pra conta dele). As partes criptográficas já estavam
   corretas (segredo de alta entropia, resgate atômico, sem IDOR); o furo era **quem pode gerar o link**.
   **Mitigação:** `create_checkout_link` exige **chamador confiável**, com chave `mp_` no header
   `X-API-Key` e o escopo `checkout:link` (migration `20260822000000`). A identidade do usuário segue
   vindo do JWT; a chave só atesta qual agente está falando. Sem a chave, a tool nem aparece no
   `tools/list`. Na prática o escopo é concedido só à chave interna da Movepark: agentes de terceiros
   buscam e reservam, mas não geram link de pagamento.

---

## 10. Fases e status

- **F0 - Registro único de tools + guard + OpenAPI** - ✅ no ar. `_shared/assistant-tools.ts`
  (registro canônico de leitura, consumido por MCP e chat), drift guard cobrindo as três superfícies
  em ambas as direções, `openapi.yaml` parseando. `current_datetime` entrou no MCP consumidor.
- **Pré-requisito de segurança** - ✅ no ar. Telefone do checkout deixou de virar credencial.
- **F1 - Autenticação de consumidor no MCP** - ✅ no ar (caminho OTP). Superfície `/customer` com
  descoberta + `request_login_otp`/`verify_login_otp`/`whoami`, rate limit por IP na borda.
  `assert_verified_identity` (chamador confiável) no ar desde 01/10/2026 (§4.1).
- **F2 - Tools transacionais** - ✅ no ar (§5). `create_booking`, `set_booking_customer`, `add_vehicle`,
  `set_booking_vehicle`, `list_my_bookings`, `get_booking`, `get_booking_status`, `cancel_booking`, sob
  JWT + RLS.
- **F3 - Handoff de checkout** - ✅ no ar (§6). Tabela `checkout_handoff` + RPC de resgate atômica +
  cron de purga; Edges `create-checkout-handoff` (JWT) e `redeem-checkout-handoff` (anon); tool
  `create_checkout_link`; front resgata o `#ht=`, faz `setSession` e deriva o passo (`resolveInitialStep`).
  O deep-link só cai no pagamento quando o aceite existe (fallback: cai no passo 1). Falta ainda o
  `accept_terms` (com aval jurídico) e o `lookup_plate` (API paga) para o fluxo pular o passo 1.
- **F4 - Superfície, doc e descoberta** - planejado. Terceiro branch de endpoint na Edge `mcp`,
  `customer-card.json`, atualização de `api-catalog`/`llms.txt`/`auth.md`.

---

## 11. Testes

Roteiros manuais de conversa (usuário real, ciclo completo, limites e tentativas de quebrar):
[agent-test-scenarios.md](./agent-test-scenarios.md).

- deno: invariante `isToolCallable` consistente com `listTools` nas três superfícies; login e tools
  transacionais.
- pgTAP `checkout_handoff.test.sql`: uso único sob concorrência, expiração, guarda de tenant, grants.
- Vitest `resolveInitialStep`: recusa passo 3 sem CPF, sem aceite, com reserva expirada.
- e2e após deploy: OTP entrega, handoff cai logado no passo 3, reuso do link falha, TTL expira,
  `assert_verified_identity` negado na superfície pública sem chave.
