# MCP — Spec (E0.7 Fase 2)

> Servidor **MCP (Model Context Protocol)** do Movepark, versionado no repo. Duas superfícies:
> **consumidor** (público/anon, descoberta) e **parceiro** (autenticado por chave `mp_`, tenant-scoped
> sobre a [Public API v1](./public-api.md)). Fonte de verdade das tools: `supabase/functions/mcp/tools.ts`
> + os cards em `public/.well-known/mcp/`. **Ao mudar uma tool, atualize tools.ts + o card + esta spec**
> (ADR-003, ver [public-api.md](./public-api.md) §2 e §12).

---

## 1. Visão geral

O MCP é uma **fachada para agentes de IA** sobre as capacidades que já existem (Edge Functions + RPCs).
Substitui o MCP externo de n8n por um servidor **in-repo**, sob o mesmo doc-as-you-build da API.

- **Consumidor** (`https://mcp.movepark.co`): descoberta pública — buscar estacionamento, simular preço,
  FAQ, listar empresas/unidades. Sem auth, todos os tenants (dado de marketing). Substrato: Edge `search`,
  Edge `get-faq`, RPC `simulate_price` (anon), RLS `catalog_read_*`.
- **Parceiro** (`https://mcp.movepark.co/partner`): tools tenant-scoped sobre a API v1, autenticadas por
  **chave de API** (`Authorization: Bearer mp_…`) e **gateadas por escopo**. Reusa `api_key_verify` + as
  RPCs `api_*`. As tools **visíveis** (`tools/list`) dependem dos escopos da chave.
- **Manager** (`https://mcp.movepark.co/manager`): escrita do blog pela Movepark, autenticada por
  **chave de plataforma** (a que tem `api_key.company_id is null`). É superfície **interna**: não tem
  card, e recusa até o `tools/list` sem chave válida. Ver §4.4.

---

## 2. Arquitetura

```
Cliente MCP (Claude, etc.)
   │  POST JSON-RPC 2.0  (Authorization: Bearer mp_…  no caso parceiro)
   ▼
mcp.movepark.co            ← Cloudflare Worker (src/api-worker.ts): roteia por hostname,
   │                          injeta `apikey` (anon) na borda, esconde a URL do Supabase
   ▼
Edge Function `mcp`        ← supabase/functions/mcp/ (Deno, verify_jwt=false)
   │  / ou /public → consumidor (anon);  /partner → parceiro (chave + escopo)
   ▼
Edge `search`/`get-faq` + RPCs `simulate_price` (anon)  |  RPCs `api_*` + `api_key_verify` (service_role)
```

**Transporte:** **Streamable HTTP** stateless — cada `POST` devolve um **JSON único** (sem SSE/sessão
nesta fase; as tools são síncronas). `initialize` não exige sessão. Streaming/notify fica para uma 2.x.

**Módulos** (`supabase/functions/mcp/`): `protocol.ts` (JSON-RPC/MCP, puro), `tools.ts` (registro +
filtro por escopo, puro), `auth.ts` (chave→hash, espelha o gateway), `index.ts` (`Deno.serve`: handshake
+ `tools/list` + `tools/call` + dispatch). Testes puros em `mcp.test.ts`.

---

## 3. Protocolo (JSON-RPC 2.0)

Métodos suportados: `initialize`, `ping`, `tools/list`, `tools/call`, e `notifications/*` (sem resposta).

- `initialize` → `{ protocolVersion, capabilities:{tools:{listChanged:false}}, serverInfo }` (ecoa a
  versão do cliente quando informada; padrão `2025-06-18`).
- `tools/list` → `{ tools: [{ name, description, inputSchema }] }`. **Parceiro:** filtrado pelos escopos
  da chave.
- `tools/call` → `params {name, arguments}` → `{ content: [{ type:"text", text:<json> }], isError? }`.
  - Tool inexistente / fora de escopo / param obrigatório ausente → **erro JSON-RPC** (`-32602`).
  - Erro de execução (regra de negócio) → `result` com `isError:true` (convenção MCP), não erro de protocolo.

### Higiene da mensagem de erro (`safeToolError`)

O texto que chega ao cliente passa por `safeToolError` (`protocol.ts`), o espelho do `pgErrorToHttp`
da REST. A regra: só mensagem **nossa** sai; internals do Postgres viram genérico.

| Origem | O que sai |
|---|---|
| `RAISE` de negócio das RPCs (`P0001`) | a mensagem, como escrita |
| Unicidade (`23505`) | "Registro já existe (conflito de unicidade)." |
| Tipo/FK/not-null (`22P02`, `23502`, `23503`, `23514`…) | "Parâmetro inválido para esta operação." |
| Qualquer outro SQLSTATE | "Erro ao executar a operação." |
| **Sem SQLSTATE** | a mensagem, **se não parecer interna** |

A última linha é a que menos se adivinha, e foi endurecida em 12/08/2026. O caminho "sem código"
existia na suposição de que erro sem SQLSTATE é sempre um `throw` de handler nosso. Não é: o
supabase-js re-lança como `new Error(error.message)`, perdendo o código e carregando nome de tabela,
coluna, constraint e policy. Agora essa mensagem passa por uma denylist de frases internas
(`violates`, `permission denied`, `row-level security`, `does not exist`, `duplicate key`,
`constraint`, `JWT expired`…).

O filtro é por **frase inglesa**, e não por heurística de aspas, de propósito: as mensagens de app
são em português e às vezes citam um valor entre aspas (`Post "guarulhos" não encontrado`), que uma
regra de aspas mataria. Como o Postgres fala inglês e o app fala português, os dois se separam sem
ambiguidade. Travado em `mcp.test.ts` nos dois sentidos: mascara 7 vazamentos reais e deixa passar 5
mensagens de app.

---

## 4. Catálogo de tools

### Consumidor (público, sem auth)

Fonte única: **`supabase/functions/_shared/assistant-tools.ts`** (`READ_TOOLS`), o mesmo registro que a
Edge `chat` consome. O MCP converte com `toMcpToolDef` e roteia por `callRead`; o card
`server-card.json` reflete o registro (o drift guard barra divergência).

| Tool | Substrato |
|---|---|
| `search_parking(dest, from, to, …)` | Edge `search` |
| `simulate_price(company, location?, parking_type?, days?)` | RPC `simulate_price` |
| `get_faq(location_id?, query?, limit?)` | Edge `get-faq` |
| `search_knowledge(query, location_id?, destination_id?, k?)` | Edge `knowledge-search` (RAG pgvector, ver `knowledge-base.md`) |
| `list_companies(limit?)` | `company` (RLS `catalog_read_company`) |
| `list_locations(limit?)` | `location` |
| `get_parking_types(location_id)` | `location_parking_type` (+ join) |
| `list_destinations(limit?)` / `get_destination(slug)` | `destination` (+ `destination_point`) |
| `current_datetime()` | data/hora no fuso `America/Sao_Paulo` (resolver datas relativas) |
| `search_blog(q?, destination?, category?, tag?, limit?)` | `blog_post` + relações; devolve título, resumo e URL, sem o corpo |
| `get_blog_post(slug)` | `blog_post` com o Markdown completo, para o agente citar e linkar |

> **Não há tool de escrita do blog, de propósito.** Publicar post é ação de Manager, e card de MCP
> é documentação pública: uma tool "privada" num card seria contradição. A escrita existe só na
> API interna (`internalRoute()` + escopo de plataforma `blog:write`), documentada em
> [blog.md](./blog.md).

### Parceiro (chave `mp_` + escopo)

| Tool | Escopo | RPC |
|---|---|---|
| `list_locations` | `locations:read` | `api_list_locations` |
| `get_location` | `locations:read` | `api_get_location` |
| `list_parking_types` | `parking-types:read` | `api_list_parking_types` |
| `get_availability` | `availability:read` | `api_assert_lpt_company` + `availability_batch` |
| `simulate_price` | `pricing:read` | `api_simulate_price` |
| `list_bookings` | `bookings:read` | `api_list_bookings` |
| `get_booking` | `bookings:read` | `api_get_booking` |
| `create_booking` | `bookings:write` | `api_create_booking` |
| `cancel_booking` | `bookings:cancel` | `api_cancel_booking` |
| `check_in_booking` / `check_out_booking` | `bookings:checkin` | `api_checkin_booking` / `api_checkout_booking` |
| `change_booking_dates` | `bookings:write` | `api_change_booking_dates` → `change_booking_dates` (reagenda pendente) |
| `change_booking_vehicle` | `bookings:write` | `api_change_booking_vehicle` (troca veículo/placa; voucher regen em background se `confirmed`) |
| `wps_event` | `wps:write` | `api_wps_event` (evento de pátio: entrada/saída → check-in/out) |
| `list_coupons` / `upsert_coupon` / `set_coupon_active` / `delete_coupon` | `coupons:read` / `coupons:write` | `api_*_coupon` |
| `list_discounts` / `upsert_discount` / `set_discount_active` / `delete_discount` | `discounts:read` / `discounts:write` | `api_*_discount` |
| `list_addons` / `upsert_addon` / `set_location_addon` / `delete_addon` | `addons:read` / `addons:write` | `api_*_addon` |
| `list_reviews` / `respond_review` | `reviews:read` / `reviews:write` | `api_list_reviews` / `api_respond_review` |
| `get_occupancy` | `occupancy:read` | `api_location_occupancy` |
| `update_location` | `locations:write` | `api_update_location` |
| `update_parking_type` | `parking-types:write` | `api_update_parking_type` |
| `update_pricing_rule` | `pricing:write` | `api_set_pricing` |
| `set_date_blocked` | `pricing:write` | `api_set_date_blocked` |

### Consumidor autenticado (`/customer`)

Terceira superfície, para um agente reservar em nome do usuário final. `serverInfo.name`
`movepark-customer`; card `customer-card.json`. Sem modelo de escopo (as tools não têm `scope`).

| Tool | Substrato | Status |
|---|---|---|
| descoberta (as 9 do consumidor) | `READ_TOOLS` / `callRead` | ✅ no ar |
| `request_login_otp` / `verify_login_otp` / `whoami` | GoTrue (`customer.logic.ts`) | ✅ no ar |
| `create_booking` / `cancel_booking` | Edges `create-booking` / `cancel-booking` (JWT) | ✅ no ar |
| `set_booking_customer` / `add_vehicle` / `set_booking_vehicle` | escrita direta (RLS do dono) | ✅ no ar |
| `list_my_bookings` / `get_booking` / `get_booking_status` | leitura direta (RLS do dono) | ✅ no ar |
| `create_checkout_link` | Edge `create-checkout-handoff` (JWT) | ✅ no ar |
| `accept_terms` / `lookup_plate` | Edges de consumidor (JWT) | F3 (pendente) |

Login por OTP (WhatsApp/e-mail) e handoff de checkout em
[agent-booking.md](./customer/agent-booking.md). `assert_verified_identity` (chamador confiável, sem
OTP) fica para a integração do bot.

#### Freio de disparo de OTP

`request_login_otp` gasta dinheiro (WhatsApp ou e-mail) e, com
`shouldCreateUser: true`, cria uma conta em `auth.users` por identificador novo.

Medido em 11/08/2026, na URL crua do Supabase:

| Camada | O que ela cobre | Estado antes |
|---|---|---|
| GoTrue | 60 segundos entre disparos para o **mesmo** identificador | já valia |
| Worker (`api-worker.ts`) | 60/min por IP, **só** no path `/customer` de `mcp.movepark.co` | contornável |
| Nada | volume **entre** identificadores diferentes | aberto |

A terceira linha era o buraco: um chamador anônimo disparava para mil números
distintos, um cada, e nenhuma camada contava. Seis disparos seguidos na URL crua
não encostaram em freio nenhum, porque a Edge é `verify_jwt = false`, o ref do
projeto é público e a Edge `chat` já usa esse caminho.

O freio novo mora **no banco** (`otp_request_allowed`, migration
`20261007000000`), que é o único ponto por onde todos os caminhos passam: 5 por
identificador e 20 por IP, em janela de uma hora. Tentativa recusada também é
registrada, senão quem estoura o limite zera a janela ao parar por um instante.
O identificador é guardado em SHA-256: telefone e e-mail de quem tenta entrar não
precisam existir em claro numa segunda tabela.

Conferido em produção, na URL crua: o 21º disparo do mesmo IP para alvos
distintos é recusado. `otp_request_log` também responde "quantos OTP saíram hoje
e para quantos identificadores distintos", que antes não tinha resposta.

**Em aberto, e não é remoção simples:** `verify_login_otp` devolve
`refresh_token` sem vínculo com quem pediu o código, o que deixa um conector
malicioso sair com credencial de longa duração se convencer o usuário a colar o
código. Trocar por um token de audiência curta exige mudar junto o
`create_checkout_link`, que hoje **recebe esse `refresh_token`** como argumento
obrigatório. É decisão de desenho do handoff, em
[agent-booking.md](./customer/agent-booking.md), não um ajuste de uma linha.

#### Quem é o dono é resolvido, e o handler filtra por ele

As tools transacionais **não** confiam só na RLS. `callCustomerTxn` resolve o usuário uma vez com
`auth.getUser()` e acrescenta `.eq("profile_id", <dono>)` em toda consulta a `booking`.

Duas razões, e as duas foram medidas:

1. **O gate anterior era presença, não validação.** Era `authHeader.startsWith("Bearer ")`, que
   aceita `"Bearer null"`, JWT expirado e qualquer string. `getUser()` fecha isso, e de quebra
   devolve o `profile_id` que faltava.
2. **A policy `booking_select` é larga de propósito.** Ela é `TO public` e permite
   `is_hub_admin() OR profile_id = auth.uid() OR location_id IN (unidades da empresa)`, porque o
   painel do operador depende disso. Fora de uma tela, isso significava que o JWT de **qualquer
   membro** de uma empresa parceira, **sem escopo nenhum**, lia CPF e telefone de reserva de
   terceiro passando o código, e `list_my_bookings` devolvia a agenda inteira da empresa. Medido no
   banco vivo em 11/08/2026, com um membro de papel `finance`: a consulta antiga trazia a reserva
   alheia com CPF e telefone, e trazia 3 reservas, nenhuma dele.

A policy fica como está. Quem estreita é o handler, e
[`supabase/tests/booking_pii_scope.test.sql`](../../supabase/tests/booking_pii_scope.test.sql) trava
os dois lados: se alguém estreitar a policy, o teste avisa antes de o painel quebrar; se alguém tirar
o filtro do handler, o teste mostra o que volta a vazar.

> Escopos = catálogo `api_scope` (ver [public-api.md](./public-api.md) §7). Tool parceiro nova ⇒ escopo
> existente (ou novo no catálogo) + entrada em `tools.ts` + `partner-card.json`.

> **Fora do catálogo por decisão (14/07/2026):** algumas capacidades de reserva existem como Edge mas
> **não** são tools de parceiro por ora (voucher, auto-extensão). O ciclo exposto hoje é
> `create`/`cancel`/`check-in`/`check-out`/`change_booking_dates`/`change_booking_vehicle`. O racional e
> o caminho de exposição das que faltam estão em [public-api.md](./public-api.md) §9.1. Ao promover
> qualquer uma a tool, seguir o checklist de §6.

---

### Manager (`/manager`, interna)

| Tool | Escopo | O que faz |
|---|---|---|
| `upsert_blog_post` | `blog:write` | Cria o post, ou atualiza o que já tem o mesmo slug |
| `publish_blog_post` | `blog:write` | Publica ou despublica |
| `delete_blog_post` | `blog:write` | Soft delete |

Os handlers são os mesmos da rota interna da API v1: `_shared/blog-write.ts`. Uma regra, duas
superfícies, porque duplicar a validação entre elas é drift garantido.

**Três travas, e a primeira é a que costuma faltar:**

1. **A superfície confere o tipo de chave, não só o escopo.** Chave de empresa não entra no
   `/manager`, e chave da Movepark não entra no `/partner`. Sem isso, bastaria um dia alguém
   conseguir `blog:write` numa chave de parceiro para ele alcançar a escrita.
2. **`tools/list` exige a chave**, igual ao parceiro. Sem chave, a superfície não diz o que tem.
3. **Nenhum card.** O `lint:openapi` reprova o build se um nome do `MANAGER_TOOLS` aparecer em
   **qualquer** card, e não só no "dele": o vazamento provável é copiar e colar no card do
   parceiro. É a mesma inversão de asserção que protege o `internalRoute()` no OpenAPI.

Medido em produção em 11/08/2026, com chave de plataforma real: sem chave o `tools/list` devolve
401; com chave devolve as três tools; a **mesma** chave no `/partner` devolve 401; `list_bookings`
pelo `/manager` devolve "Tool indisponível"; e o ciclo de criar rascunho, publicar e excluir passa,
com slug de categoria inexistente recusado e obrigatório ausente barrado antes de escrever. As
chamadas ficam no `api_request_log` com `company_id` nulo.

---

### Uma URL só

`https://mcp.movepark.co` atende todo mundo. Na **raiz** é a credencial que
escolhe o perfil; nos paths explícitos ela apenas **confirma** a superfície
declarada.

| O que você manda na raiz | Perfil | Tools |
|---|---|---|
| nada | consumidor anônimo | 12 |
| `Authorization: Bearer <jwt>` | consumidor autenticado | 23 |
| `Authorization: Bearer mp_…` com empresa | parceiro | conforme o escopo |
| `Authorization: Bearer mp_…` sem empresa | Manager | 3 |
| credencial recusada | nenhum, 401 | zero |

**Por que os paths continuam existindo.** Num path declarado sobram duas fontes
independentes, o que o cliente disse e o que o banco devolveu, e a resolução
recusa quando elas discordam. É essa independência que segura o dia em que uma
delas estiver errada, e foi o argumento mais forte contra unificar tudo. A raiz
existe para a ergonomia; o path, para quem quer declarar intenção.

`/public` é escolha explícita de ficar anônimo: uma chave no header ali **não**
promove, recusa. Sem isso o path deixaria de significar algo.

**Recusa não rebaixa.** Chave revogada na raiz devolve 401, e não as tools
públicas. Rebaixar em silêncio esconderia a revogação: o parceiro veria a
descoberta funcionando e concluiria que a chave dele vale.

**Os cards continuam honestos.** `server-card.json` descreve a raiz para quem
chega sem credencial, que é exatamente quem lê um card público. Os outros
apontam para os paths. Nenhum precisou mudar.

**`initialize` devolve o perfil**, e só com credencial aceita. Sem credencial
válida a resposta é idêntica com chave ruim ou nenhuma, que é o que impede o
método (aberto, sem rate limit) de virar triagem gratuita de chave vazada. A
informação "essa chave vale" já era obtível por `tools/list`; a diferença é que
agora as duas tentativas ficam no `api_request_log`, com o motivo.

**O `GET` da raiz é descoberta**, e responde o mapa credencial→perfil sem revelar
perfil nenhum, nem com chave boa.

#### Colisão de nome entre registros

Quinze nomes existem em mais de um registro. Três são perigosos: `get_booking`,
`create_booking` e `cancel_booking` estão em parceiro **e** em consumidor, com
argumentos e escopo de dados diferentes (`booking_id` da empresa contra
`booking_code` do dono). Outros, como `list_locations` e `simulate_price`, são a
mesma ideia em versão pública e tenant-scoped.

Enquanto o dispatch vinha do path, isso não podia dar errado. Numa URL só, quem
escolhe o handler é o perfil resolvido, e o dia em que alguém indexar por **nome**
em vez de por **(perfil, nome)** o `get_booking` do parceiro roda com o contexto
do outro. `dispatcher.test.ts` tem dois testes só para isso, e eles observam a
diferença pelo obrigatório de cada schema.

### Recusa e auditoria

A resposta de recusa é **byte a byte a mesma** para credencial ausente, inválida,
revogada e expirada. Medido em produção: as quatro devolvem 401 com o mesmo
`sha256`. Se diferissem, o endpoint viraria serviço gratuito de triagem de chave
vazada, e ele não tem rate limit.

O `initialize` e o `ping` seguem respondendo **sem** credencial, e respondem
igual com chave boa, ruim ou ausente. É deliberado, pelo mesmo motivo.

O que distingue os casos é o **log**, não a resposta:

| Motivo em `api_request_log.path` | O que aconteceu |
|---|---|
| `credencial_ausente` | superfície de chave chamada sem chave |
| `chave_invalid_key` | chave que não existe |
| `chave_revoked` | chave revogada |
| `chave_expired` | chave vencida |
| `chave_fora_da_superficie_<x>` | chave de empresa no Manager, ou o contrário |
| `credencial_ambigua` | chave nos dois headers ao mesmo tempo |

Antes desta fase a auditoria exigia parceiro **autenticado**, então falha de
autenticação não deixava rastro nenhum: a pergunta "quantas credenciais inválidas
apareceram hoje" não tinha resposta. Chamada anônima do consumidor continua fora
do log de propósito: ela não apresentou credencial, é o maior volume do servidor,
e registrá-la trocaria uma pergunta de segurança por custo de escrita em toda
leitura pública.

### O dispatcher tem teste

`handle(req, deps)` saiu de dentro do `Deno.serve` com as dependências
injetadas, e `dispatcher.test.ts` mede o que antes dependia de ninguém errar ao
ler o arquivo: a trava de tipo de chave, o formato do 401, o gate de escopo no
`tools/call`, a validação de obrigatório antes de escrever, o 404 de superfície
desconhecida e cada linha de auditoria. São 19 casos, e nenhum toca rede.

Conferido por mutação: seis quebras deliberadas, seis falhas. Duas delas
acharam defeito de verdade na primeira rodada, porque o 401 retornava cedo e
pulava a auditoria.

### Como a credencial vira perfil

A decisão mora numa função pura, [`resolver.ts`](../../supabase/functions/mcp/resolver.ts), com o
lookup de chave injetado, e é medida pela matriz em `resolver.test.ts`. Antes ela eram três blocos de
condicional dentro do `Deno.serve`, sem um único teste.

| Entrada | Perfil |
|---|---|
| Sem credencial | a superfície do path, e as de chave recusam |
| `Authorization: Bearer <JWT>` | o sujeito é um usuário; o perfil segue o path |
| `Authorization: Bearer mp_…` com empresa | `partner`, e só na superfície `/partner` |
| `Authorization: Bearer mp_…` sem empresa | `manager`, e só na superfície `/manager` |
| `X-API-Key: mp_…` sem empresa | não credencia ninguém; só acrescenta escopo de agente |

Cinco regras, e cada uma existe por um motivo medido:

1. **`Authorization` é o sujeito, `X-API-Key` é o agente.** Nunca se trocam. Antes o
   `extractApiKey` preferia o `Authorization` e descartava o `X-API-Key` em silêncio, o que fazia
   quem mandava os dois receber 401 sem explicação. Agora isso é 400, dizendo qual header usar.
2. **Só é chave o que começa com `mp_`,** conferido antes de tocar no banco. `keyPrefix` são 16
   caracteres, e todo JWT HS256 do Supabase começa com a mesma constante: mandar JWT ao
   `api_key_verify` faria dele um oráculo de prefixo válido, além de uma consulta ao banco por
   request anônima.
3. **A credencial confirma a superfície declarada; nunca promove.** Chave de empresa não abre o
   Manager, chave da Movepark não abre o parceiro. São duas fontes independentes, o path e o
   `company_id`, e é a independência que segura o dia em que uma delas estiver errada.
4. **Recusa responde igual** para ausente, inválida, revogada e expirada. O motivo existe, e vai
   para o log.
5. **O path é comparado por igualdade,** e não por `includes`. Antes `/partnerX` e `/x/manager/y`
   casavam a superfície; hoje sufixo desconhecido é 404. A comparação entende os dois caminhos que
   chegam aqui: `/partner` pelo worker e `/functions/v1/mcp/partner` direto no Supabase, que é o que
   a Edge `chat` usa.

Conferido por mutação: oito quebras deliberadas, oito falhas na matriz. E medido em produção nas
onze combinações da tabela acima, pelos dois caminhos.

---

## 5. Descoberta (`.well-known`)

- `mcp/server-card.json` — card do consumidor (tools + `inputSchema`, `url: https://mcp.movepark.co`).
- `mcp/partner-card.json` — card do parceiro (tools + escopo + nota de auth, `url: …/partner`).
- `agent-skills/index.json` — referencia os três cards com `sha256` (recalcular ao mudar um card).
- A superfície `/manager` **não** entra em nada disto, de propósito. Ver §4.4.
- `api-catalog` + `llms.txt` — linkam as superfícies públicas. A de Manager não entra em nenhum dos dois.
- `.mcp.json` (config local do Claude Code) — aponta `movepark-hub` → `https://mcp.movepark.co`, e a
  credencial no header decide o perfil (ver §4).

---

## 6. Doc-as-you-build (ADR-003) — checklist por tool

1. [ ] `supabase/functions/mcp/tools.ts` — definição (`name`/`description`/`inputSchema`/`scope`) + handler em `index.ts`.
2. [ ] `public/.well-known/mcp/server-card.json` **ou** `partner-card.json` — mesma tool + schema.
3. [ ] (parceiro) escopo no catálogo `api_scope` se for novo.
4. [ ] esta spec (§4) + teste deno (`mcp.test.ts`).
5. [ ] `agent-skills/index.json` — recalcular `sha256` do card alterado.
6. [ ] CI: `bun run lint:openapi` cobre o drift (tools.ts ↔ cards).

---

## 7. Testes & verificação

Quatro camadas, e a divisão importa: as três primeiras rodam sem rede, então são gate de PR; a
última fala com o ambiente publicado e só roda em `test:int`.

| Arquivo | O que cobre |
|---|---|
| `mcp/mcp.test.ts` | protocolo (initialize/list/call), erros JSON-RPC, filtro de escopo, validação de `required`, e a higiene do `safeToolError` (§3) |
| `mcp/resolver.test.ts` | a matriz de credencial: path declarado × `Authorization` × `X-API-Key`, com uma invariante sobre 120 combinações (nenhuma vira `manager` sem chave de plataforma) |
| `mcp/dispatcher.test.ts` | o `handle()` HTTP com dependências injetadas: 401 byte a byte, trava de tipo de chave, gate de escopo, colisão de nome entre registros, e cada linha de auditoria |
| `mcp/customer.logic.test.ts` | as tools de login e transacionais do consumidor, e quais exigem sessão |
| `test/mcp/surfaces.int.test.ts` e `knowledge.int.test.ts` | contra o `mcp.movepark.co` publicado: handshake, gates de sessão e escopo, e a recuperação semântica |
| `src/api-worker.contract.test.ts` | a borda: allowlist de superfície, freio por nome de tool, CORS e a página de docs |

Conferido por mutação nas partes que decidem autorização: quebrar cada regra de propósito faz o
teste correspondente falhar. Teste que passa sempre não protege nada.

## 8. Open points

- [ ] Streaming/SSE + sessão (`Mcp-Session-Id`) — só se alguma tool virar long-running.
- [x] ~~Aposentar o MCP n8n~~. Feito: o `.mcp.json` hoje só declara `gemini-image`, e nenhum
  runtime do repo aponta para o hostname público (a Edge `chat` fala com a Edge direto).
- [ ] OAuth para o MCP parceiro (hoje é chave `mp_` no header) — avaliar em E4.1.
- [ ] Vincular o `verify_login_otp` a quem pediu o código. Ele devolve `refresh_token` sem amarra
  com o agente, e trocar por token de audiência curta exige mexer junto no `create_checkout_link`,
  que recebe esse mesmo `refresh_token` como argumento obrigatório. Decisão de desenho do handoff,
  em [agent-booking.md](./customer/agent-booking.md), não ajuste de uma linha.
- [ ] Decidir se o parceiro passa a enxergar também as 12 tools públicas de leitura. Hoje ele perde
  `search_parking` e `search_knowledge` na mesma conexão. Muda o `partner-card.json`.
