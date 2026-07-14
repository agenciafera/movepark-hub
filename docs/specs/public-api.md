# Public API — Spec

> API pública do Movepark Hub: expõe as capacidades do sistema como endpoints versionados,
> autenticados por **chave de API** com **escopos** (permissões), servidos atrás de um domínio
> próprio (`api.movepark.co`) e documentados em **OpenAPI**.
>
> **Origem:** Épico **E0.7 — Setup de documentação contínua de API + MCP (doc-as-you-build)**.
> Esta spec é a fonte de verdade da API. **Ao mudar a API, atualize esta spec + o OpenAPI no mesmo PR** (ADR-003, §2).

---

## 1. Visão geral

O Hub já tem toda a lógica de negócio em **RPCs Postgres** + **Edge Functions** (Supabase). Hoje
essas capacidades são consumidas só pelo nosso próprio front (React) e por um MCP externo (n8n). A
**Public API** transforma essas capacidades em uma **API pública estável**, para que parceiros e
sistemas externos (ex.: WPS e sistemas de pátio — E2.6) integrem programaticamente.

**Princípios:**

1. **Reuso, não reescrita.** A API é uma *camada de borda* sobre as RPCs/Edge Functions que já
   existem. Nenhuma regra de negócio nova mora no gateway — ele autentica, autoriza (escopo),
   isola o tenant e despacha.
2. **Tenant-scoped por padrão.** Toda chave pertence a uma `company`. A API só enxerga e modifica
   dados daquela empresa. Isolamento garantido no backend, nunca no cliente.
3. **Documentada na origem (doc-as-you-build).** Todo endpoint nasce no OpenAPI + nesta spec na
   mesma entrega. Ver **ADR-003** (§2).
4. **Versionada e estável.** Prefixo `/v1`. Mudança incompatível → `/v2`.

**Fora de escopo desta fase:** exposição via **MCP** (server-card/tools) — fica para a **Fase 2**
(§13), conectando com **E4.1**. A infraestrutura de doc (`.well-known/`) já criada em **E0.4** é
reaproveitada (§11).

---

## 2. ADR-003 · Doc API+MCP junto com a implementação (doc-as-you-build)

> **Regra fixa de arquitetura do projeto — não violar.** Equivalente, dentro deste repo, ao bloco
> canônico de `gestao/regras-arquitetura.md`.

**Decisão:** toda implementação que seja (ou possa virar) **API** ou parte do **MCP** **nasce
documentada na mesma entrega**:

- **Contrato OpenAPI** atualizado (`public/openapi.yaml`), e
- **Escopo** correspondente registrado no catálogo (§7), e
- **(Fase 2)** registro/descrição no **MCP server card** e nas **tools**, e
- **`llms.txt`** atualizado quando a capacidade for relevante para descoberta por humanos/agentes.

**Não deixar doc para depois.** Doc feita depois vira dívida e quebra a descoberta por humanos e por
IA/agentes (o Hub é agent-ready, E0.4). A operacionalização da regra (checklist por endpoint/tool e
gatilho no Claude Code) está em §12.

**Consequências:** um PR que adiciona/altera endpoint ou tool sem atualizar OpenAPI + escopo + esta
spec é considerado **incompleto** e deve falhar na revisão (e idealmente no CI — §12).

---

## 3. Arquitetura

```
Cliente externo (parceiro / sistema de pátio / script)
   │  Authorization: Bearer mp_live_…
   ▼
api.movepark.co               ← Cloudflare Worker (proxy/edge): roteamento, CORS,
   │  (rewrite + proxy)          rate-limit por chave, oculta a URL do Supabase
   ▼
Supabase Edge Function `api`  ← gateway: valida a chave (hash), resolve company + escopos,
   │  (router /v1/*)             checa escopo do endpoint, injeta company_id, despacha
   ▼
RPCs Postgres (SECURITY DEFINER) / queries  ← MESMA lógica que o front já usa
   │
   ▼
PostgreSQL (RLS + dados do tenant)
```

**Por que um gateway (Edge Function) e não PostgREST direto?** As chaves de API **não são JWTs do
Supabase**; o PostgREST autentica por JWT/RLS. O gateway nos dá: autenticação por chave + hash,
checagem de escopo por endpoint, shape de resposta estável (desacoplado do schema), versionamento e
um ponto único para rate-limit e logs de uso. Internamente ele reusa as RPCs `SECURITY DEFINER`
existentes (padrão `operator_*`), que já validam o vínculo com a empresa.

---

## 4. Domínio e roteamento (Cloudflare Worker)

**Decisão:** a API é servida em **`api.movepark.co`** — um subdomínio dedicado, separado do site
(`hub.movepark.co`). O parceiro nunca vê a URL crua do Supabase (`*.supabase.co/functions/v1/...`).

> ✅ **Decidido.** `api.movepark.co` confirmado; a exceção já está registrada no `CLAUDE.md` (a regra
> de "sem subdomínios" continua valendo só para a superfície de SEO/consumidor). Alternativa avaliada
> e preterida: `api-hub.movepark.co`.

**Worker (`src/api-worker.ts`, rota própria no `wrangler.jsonc`):**

| Responsabilidade | Detalhe |
|---|---|
| Rewrite + proxy | `api.movepark.co/v1/*` → `https://<project>.supabase.co/functions/v1/api/v1/*` |
| CORS | Liberado para uso server-to-server; preflight `OPTIONS` tratado na borda |
| Rate-limit por chave | Contador em Cloudflare KV/DO por `key_prefix` (limites em §10). v1: best-effort |
| Headers de plataforma | injeta `x-forwarded-*`, propaga `x-request-id`; **nunca** vaza a URL do Supabase |
| `/openapi.yaml` e `/docs` | serve o contrato e a doc human-friendly (§11) |

> O worker do site (`src/worker.ts`) continua só com `hub.movepark.co`. O da API é separado para não
> misturar content-negotiation de Markdown/SSG com proxy de API.

---

## 5. Autenticação — chaves de API

**Esquema:** `Authorization: Bearer <chave>`. (Aceitar também `X-API-Key: <chave>` como alias.)

**Formato da chave:** `mp_<ambiente>_<segredo>`
- `mp_live_…` (produção) e `mp_test_…` (sandbox), alinhado aos tokens `mp-*` da marca.
- `<segredo>`: 32+ bytes aleatórios em base62 (CSPRNG).
- Exemplo (ilustrativo): `mp_live_8Kд… ` → exibido **uma única vez** na criação.

**Armazenamento (nunca em texto puro):**
- Guardamos **`key_hash` = sha256(chave completa)** e um **`key_prefix`** curto (ex.: `mp_live_8Kf2c1`,
  ~12 chars) só para exibição/lookup. Lookup: indexar por `key_prefix` → comparar `key_hash`.
- O segredo completo **não é recuperável**. Perdeu, gera outra e revoga a antiga.

**Ciclo de vida:** criar → (usar) → **rotacionar** (gera nova, deixa as duas ativas por um período) →
**revogar** (`revoked_at`). Chave revogada ou expirada (`expires_at`) → `401`.

**Boas práticas refletidas na resposta:** `last_used_at` atualizado de forma assíncrona (não bloqueia
a request); chaves `mp_test_*` operam contra dados/sandbox marcados, sem efeitos colaterais externos.

---

## 6. Modelo de dados

Nova migration (`AAAAMMDDHHMMSS_public_api_keys.sql`). Tabelas no singular, padrão do schema.

### `api_key`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `company_id` | `uuid` FK→`company` | tenant dono da chave (`on delete cascade`) |
| `name` | `text` | rótulo dado pelo operador (ex.: "Integração WPS") |
| `key_prefix` | `text` unique | parte visível, indexada para lookup |
| `key_hash` | `text` | sha256 da chave completa — **nunca** o segredo |
| `environment` | `text` CHECK (`live`/`test`) | |
| `scopes` | `text[]` | escopos concedidos (§7); validados contra o catálogo |
| `last_used_at` | `timestamptz` null | uso mais recente (atualização assíncrona) |
| `expires_at` | `timestamptz` null | opcional; null = sem expiração |
| `revoked_at` | `timestamptz` null | revogação manual |
| `created_by` | `uuid` FK→`profile` | quem criou |
| `created_at`/`updated_at`/`deleted_at` | `timestamptz` | trigger `set_updated_at`; soft-delete |

Índices: `unique(key_prefix)`, `index(company_id) where deleted_at is null`.

### `api_request_log` (uso/auditoria) — ✅ Fase 1.1 (migration `20260625000000`)

`id`, `api_key_id`, `company_id`, `surface` (`rest`/`mcp`), `method`, `path`, `scope`, `status`, `ip`,
`request_id`, `latency_ms`, `created_at`. O **gateway REST** e o **MCP parceiro** gravam uma linha por
request **autenticado** (via service_role, em background — não bloqueia a resposta). RLS: operator lê
só os da própria empresa; sem escrita direta. Leitura agregada/recente pelo operator via RPC
`operator_api_usage(p_company_id, p_limit, p_since)` (summary + recent). **Retenção 90 dias** via
pg_cron `prune-api-request-log` (`cron_prune_api_request_log`). pgTAP `api_request_log_rpc.test.sql`.

**RLS / escrita:** `api_key` **não tem escrita direta** por RLS. Toda gestão passa por RPCs
`SECURITY DEFINER` (§9), espelhando o padrão de `coupon`/`add_on_service`. Leitura pelo operador:
só as chaves da própria empresa, **sem** `key_hash` (a view/RPC de listagem nunca devolve o hash nem
o segredo). `hub_admin` enxerga todas (suporte).

---

## 7. Escopos (catálogo de permissões)

Formato: **`modulo:acao`**. Uma chave carrega um array de escopos; o endpoint declara o escopo que
exige; o gateway nega (`403 insufficient_scope`) se faltar.

| Escopo | Concede |
|---|---|
| `locations:read` | listar/ler unidades da empresa |
| `locations:write` | editar dados de unidade (campos que o operador já pode) |
| `parking-types:read` | listar tipos de vaga e preços |
| `parking-types:write` | editar preço/status/capacidade de tipo de vaga |
| `availability:read` | consultar disponibilidade por período |
| `pricing:read` | simular preço (`simulate_price`) |
| `bookings:read` | listar/ler reservas da empresa |
| `bookings:write` | criar reserva via API |
| `bookings:cancel` | cancelar reserva |
| `bookings:checkin` | registrar check-in/check-out |
| `wps:write` | eventos de pátio (entrada/saída de veículo) — ver `wps-integration.md` |
| `coupons:read` / `coupons:write` | ler/gerir cupons |
| `discounts:read` / `discounts:write` | ler/gerir descontos automáticos |
| `addons:read` / `addons:write` | ler/gerir serviços adicionais (+ por unidade) |
| `reviews:read` / `reviews:write` | ler avaliações / responder |
| `occupancy:read` | consultar ocupação por data |
| `faq:read` | ler FAQ |
| `webhooks:write` | registrar/gerir webhooks de integração (E2.6) |
| `pricing:write` | editar regra de preço/tiers e bloquear datas |

**Escopos só-internos (ADR-005).** O catálogo `api_scope` também guarda escopos usados **só** pela
permissão in-app (papéis da empresa) — `finance:read`, `payouts:read`, `payouts:write`, `team:read`,
`team:write`, `api-keys:write` — e **`webhooks:write`**, que fica não-atribuível enquanto a config de
webhook (E2.6) for hub_admin-only (o segredo mora no Manager). Todos têm
**`assignable_to_api_key = false`** e são **rejeitados** por `api_assert_scopes` ao criar/editar uma
chave (o gateway nunca os roteia); o **drift guard** (`lint:openapi`) garante que nenhum escopo
**atribuível** fique sem rota/tool. Ver [permissions.md](./permissions.md).

**Catálogo é a fonte de verdade dos escopos** e cresce por **doc-as-you-build**: módulo novo na API
⇒ escopo novo aqui + no OpenAPI (`securitySchemes`/`scopes`) + na migration de seed do catálogo.
Convenção: `read` = leitura; `write` = criar/editar; ações de transição de estado ganham verbo
próprio (`cancel`, `checkin`) quando a granularidade importa para o parceiro.

> O catálogo de escopos vive numa tabela de referência (`api_scope`: `scope`, `description`,
> `module`) seedada por migration, para a UI do operador (§8) listar e validar escopos sem
> hard-code no front.

---

## 8. Painel do operador — gestão de chaves

**Rota:** `/operator/api-keys` (nav "API" / "Desenvolvedores"). Detalhar também em
[operator-panel.md](./operator-panel.md) (§4.10). Acesso: `company_operator` (e `hub_admin` via
impersonation — usar `effectiveCompanyIds`).

**Tela — lista de chaves**

Colunas: `Nome` · `Prefixo` (ex.: `mp_live_8Kf2c1…`) · `Ambiente` · `Escopos` (chips) ·
`Último uso` · `Criada em` · `Status` · `Ações`.

- **Criar chave** → dialog: `name`, `environment` (live/test), seleção de **escopos** (lista do
  catálogo §7, agrupada por módulo), `expires_at` opcional. Ao confirmar, mostra o **segredo uma
  única vez** com botão copiar + aviso "guarde agora, não será exibida de novo". Persiste via RPC
  `operator_create_api_key` → retorna a chave em claro **só nessa resposta**.
- **Rotacionar** → `operator_rotate_api_key` (gera nova, mantém a antiga ativa por um TTL de graça).
- **Revogar** → `operator_revoke_api_key` (`revoked_at = now()`), efeito imediato.
- **Editar escopos** → `operator_update_api_key_scopes` (revalida contra o catálogo).

> A UI **nunca** recebe `key_hash` nem o segredo após a criação. Princípio do menor privilégio: ao
> criar, marcar só os escopos necessários.

---

## 9. Superfície da API v1 (inicial)

Todos os caminhos sob `https://api.movepark.co/v1`. **Tenant implícito** pela chave (a empresa não
vai na URL). Respostas em JSON com envelope estável (§10). Mapeamento para a lógica existente:

| Método & caminho | Escopo | Despacha para | Notas |
|---|---|---|---|
| `GET /locations` | `locations:read` | query/RPC de unidades da empresa | paginado |
| `GET /locations/{id}` | `locations:read` | idem | 404 se não for da empresa |
| `GET /locations/{id}/parking-types` | `parking-types:read` | `location_parking_type` | preço + status |
| `GET /availability` | `availability:read` | `check_availability`/`availability_batch` | `?location_parking_type_id&from&to` |
| `POST /pricing/simulate` | `pricing:read` | `simulate_price` | mesmo contrato do front |
| `GET /bookings` | `bookings:read` | listagem de reservas (filtros) | status, período, paginação |
| `GET /bookings/{id}` | `bookings:read` | detalhe da reserva | |
| `POST /bookings` | `bookings:write` | `create_booking_atomic` | reserva **atribuída à empresa** (criada pelo parceiro), sem JWT de consumidor; idempotente (§10) |
| `POST /bookings/{id}/cancel` | `bookings:cancel` | RPC de cancelamento | motivo no corpo |
| `POST /bookings/{id}/check-in` | `bookings:checkin` | transição `confirmed→checked_in` | reusa RLS/voucher |
| `POST /bookings/{id}/check-out` | `bookings:checkin` | transição de saída | |
| `POST /wps/events` | `wps:write` | evento de pátio (entrada/saída ANPR) → check-in/out | idempotente; ver `wps-integration.md` |
| `GET /coupons` · `POST /coupons` … | `coupons:*` | `operator_*_coupon`/`*_discount` | espelha §4.6 do operator |
| `GET /faq` | `faq:read` | `get-faq` | |
| `GET/POST /coupons` · `/coupons/{id}/active` · `/delete` | `coupons:*` | `api_*_coupon` | CRUD |
| `GET/POST /discounts` · `/discounts/{id}/active` · `/delete` | `discounts:*` | `api_*_discount` | CRUD |
| `GET/POST /addons` · `/addons/{id}/locations` · `/delete` | `addons:*` | `api_*_addon` | CRUD + por unidade |
| `GET /reviews` · `POST /reviews/{id}/respond` | `reviews:*` | `api_list_reviews`/`api_respond_review` | |
| `GET /occupancy` | `occupancy:read` | `api_location_occupancy` | `?location_id&from&to` |
| `POST /locations/{id}` | `locations:write` | `api_update_location` | PATCH (campos ausentes = mantém) |
| `POST /parking-types/{id}` | `parking-types:write` | `api_update_parking_type` | status/capacidade/regras |
| `POST /parking-types/{id}/pricing` | `pricing:write` | `api_set_pricing` | base_price + regra + tiers (E1.4.1) |
| `POST /parking-types/{id}/date-blocks` | `pricing:write` | `api_set_date_blocked` | bloqueia/desbloqueia uma data (E1.4.2) |

> **Paridade:** os endpoints acima espelham as capacidades do operator panel. As RPCs `api_*` espelham
> as `operator_*` keyed por `company_id` (o gateway já autorizou empresa+escopo) — mantenha as duas em
> sincronia ao mudar a regra. Webhooks (E2.6, `webhooks:write`) entram quando aquele épico for feito.
>
> Esta tabela **cresce por doc-as-you-build** (§12): endpoint novo ⇒ linha aqui + path no OpenAPI +
> escopo no catálogo.

### 9.1 · Capacidades internas fora da superfície (decisão registrada em 14/07/2026)

Auditoria de 14/07/2026 da superfície API/MCP: existem Edge Functions com lógica que **poderia**
virar endpoint público, mas que ficam **intencionalmente internas** por ora. Registrado aqui para
manter o ADR-003 honesto: a ausência é **decisão**, não drift. Reavaliar quando um parceiro pedir.
Ao expor qualquer uma, seguir o checklist de §12 (RPC `api_*` com assert de empresa, rota, OpenAPI,
tool/card, teste, drift).

| Capacidade (Edge) | Escopo se exposta | Por que fica interna hoje |
|---|---|---|
| Reagendar reserva (`change-booking-dates`) | `bookings:write` | Mutação de reserva forte candidata (a RPC já é server-authoritative e re-precifica). Segurada por ora. Ao expor: `api_change_booking_dates` + `POST /bookings/{id}/change-dates` + tool `change_booking_dates`. |
| Trocar veículo/placa (`change-booking-vehicle`) | `bookings:write` | Idem, útil para integração de pátio/ANPR. Mesmo caminho de exposição. |
| Baixar voucher (`voucher-pdf`) | `bookings:read` | Leitura escopada, baixo risco. Entraria como `GET /bookings/{id}/voucher` (signed URL). |
| Auto-extensão por atraso de voo (`extend-booking`) | `bookings:write` | Muito acoplada ao benefício Superflex e à notificação. Só junto do pacote de mutações acima. |
| Consulta de placa (`lookup-vehicle-plate`) | (novo) | Utilitário externo pago. Só faria sentido com rate-limit por chave, senão fica interna. |

> As demais Edges novas (pagamento, payouts, sync WL/WPS, crons de reconciliação, conta/LGPD, funil
> de leads, chat) são corretamente internas: exigem JWT de consumidor ou hub_admin, são crons
> protegidos por chave, ou usam escopo `assignable_to_api_key = false`. Não entram na superfície.

---

## 10. Convenções transversais

**Versionamento:** `/v1`. Aditivo (campo novo) não quebra versão; remoção/rename ⇒ `/v2` + período
de depreciação anunciado por header `Sunset`.

**Envelope de resposta:**
```json
{ "data": { /* … */ }, "meta": { "request_id": "…" } }
```
Listas: `data` é array + `meta.pagination` (`limit`, `offset`/`cursor`, `total?`).

**Erros (forma única):**
```json
{ "error": { "code": "insufficient_scope", "message": "…", "request_id": "…" } }
```
Códigos: `401 unauthorized` (chave ausente/inválida/revogada), `403 insufficient_scope`,
`404 not_found`, `409 conflict`, `422 validation_error`, `429 rate_limited`, `5xx internal`.

**Idempotência:** mutações (`POST /bookings`) aceitam `Idempotency-Key` (header); o gateway
deduplica por `(api_key_id, idempotency_key)` numa janela curta para evitar reserva dupla em retry.

**Paginação:** `limit` (default 20, máx 100) + `offset` (ou cursor onde fizer sentido).

**Rate-limit:** por `key_prefix`, na borda (Cloudflare Worker + KV `API_RATELIMIT`, janela fixa de
60s). Default **60 req/min**; `429` com `Retry-After`. Best-effort (não-transacional). Limites por
plano/parceiro ⇒ E4.1.

**Datas:** ISO-8601 UTC, igual ao resto do sistema.

---

## 11. Documentação pública (OpenAPI + `.well-known`)

**Fonte de verdade do contrato:** `public/openapi.yaml` (OpenAPI 3.1), versionado e revisado no PR.
`securitySchemes` declara o esquema Bearer e os **scopes** (espelha §7).

**Publicação (reaproveitando E0.4 — `public/.well-known/`, copiado para `dist/`):**

| Artefato | Onde | Conteúdo |
|---|---|---|
| `openapi.yaml` | `api.movepark.co/openapi.yaml` | contrato servido pelo worker da API |
| Doc human-friendly | `api.movepark.co/docs` | render do OpenAPI (Scalar/Redoc/Stoplight Elements) |
| `api-catalog` (RFC 9727) | `/.well-known/api-catalog` | **atualizar** `service-desc` apontando para o `openapi.yaml` |
| `llms.txt` | `/llms.txt` | seção "API pública" com link para docs e OpenAPI |
| `mcp/server-card.json` | `/.well-known/mcp/server-card.json` | **Fase 2** — tools do MCP derivadas da API |

> O `api-catalog` atual aponta `service-doc` para `/faq`. Ao implementar, trocar para a doc da API.

---

## 12. Operacionalização do doc-as-you-build (ADR-003)

**Checklist mínimo — todo PR que cria/altera endpoint ou escopo:**

1. [ ] `public/openapi.yaml` — path + request/response schema + `security` (escopos exigidos).
2. [ ] Catálogo de escopos (§7) + seed `api_scope` (migration), se houver escopo novo.
3. [ ] Tabela de superfície (§9) desta spec atualizada.
4. [ ] `.well-known/api-catalog` / `llms.txt` se mudou algo de descoberta de alto nível.
5. [ ] **(Fase 2)** `mcp/server-card.json` + descrição da tool, se a capacidade virar tool MCP.
6. [ ] Teste: pgTAP para RPC/escopo nova; `deno test` para o branch do gateway; regressão para bug.

**Gatilho no Claude Code (instrução de projeto):** adicionar ao `CLAUDE.md` um bloco **ADR-003**
curto que referencie esta spec e ordene: *"toda capacidade que vira API/MCP nasce documentada na
mesma entrega — seguir o checklist de `public-api.md` §12; sinalizar se algo conflitar"*. Assim a
regra fica ativa em todo trabalho futuro, não só nesta tarefa.

**CI (✅ drift guard):** `bun run lint:openapi` (`scripts/check-openapi-drift.mjs`) checa que toda
rota servida pelo gateway (`supabase/functions/api/router.ts`) tem path correspondente no
`public/openapi.yaml`; roda no job `quality` do CI. (Lint completo de spec OpenAPI — `redocly`/`spectral`
— fica como melhoria futura para não adicionar dependência ao gate.)

---

## 13. Fases

**Fase 1 — API pública + chaves + worker + docs (esta spec, E0.7):**
1. Migration: `api_key`, `api_scope` (seed do catálogo), RPCs de gestão (`operator_*_api_key`).
2. Edge Function `api` (gateway): auth por chave, checagem de escopo, dispatch para as RPCs,
   superfície v1 inicial (§9). `deno test` de auth/escopo/erros.
3. Cloudflare Worker `api.movepark.co` (proxy + CORS + rate-limit + `openapi.yaml`/`docs`).
4. `public/openapi.yaml` + atualização de `api-catalog`/`llms.txt`.
5. UI `/operator/api-keys` (criar/rotacionar/revogar/escopos) + testes de componente.
6. ADR-003 ativado no `CLAUDE.md` (§12).

**Fase 2 — MCP (✅ implementada; conecta E4.1):** servidor MCP in-repo (Edge `mcp`, Streamable HTTP)
com duas superfícies — **consumidor** (`mcp.movepark.co`, anon) e **parceiro** (`/partner`, chave `mp_`
+ escopo) sobre as RPCs `api_*`/`api_key_verify`. Substitui o MCP n8n. Detalhes, catálogo de tools e
checklist próprio em **[mcp.md](./mcp.md)**.

---

## 14. Segurança

- Segredo **nunca** persistido nem logado em claro; só `sha256` + prefixo. Logs/erros redigem a chave.
- **Tenant isolation** sempre no backend: o gateway injeta o `company_id` da chave; as RPCs revalidam
  o vínculo (`*_assert_company_access`). O cliente nunca escolhe a empresa.
- Menor privilégio: escopos mínimos por chave; `live`/`test` separados.
- Revogação imediata (`revoked_at`) e expiração (`expires_at`); rotação sem downtime.
- Rate-limit + idempotência contra abuso e ret\-storms.
- Auditoria via `api_request_log` (quem, o quê, quando) — base para antifraude/observabilidade (E4.1).
- `hub_admin` pode listar/suportar chaves de qualquer empresa, mas **não** vê o segredo (só prefixo).

---

## 15. Testes

| Camada | O quê | Runner |
|---|---|---|
| pgTAP | RPCs `operator_*_api_key` (criação/rotação/revogação/escopos), guard de empresa, seed `api_scope` | `bun run test:db` |
| Edge (`deno test`) | gateway: chave válida/ inválida/ revogada/ expirada, escopo presente/ ausente, 401/403/404/422, idempotência | `bun run test:edge` |
| Componente (Vitest) | `/operator/api-keys`: criar mostra segredo 1x, revogar, gating de role (MSW) | `bun run test` |
| Lint OpenAPI / drift | `openapi.yaml` válido e em sincronia com a superfície | CI (§12) |

---

## 16. Decisões & open points

**Decidido:**
- ✅ **Domínio:** `api.movepark.co` (exceção já registrada no `CLAUDE.md`).
- ✅ **Tudo autenticado / tenant-scoped:** não há API pública anônima nesta fase — toda chamada exige
  chave e só enxerga os dados da empresa dona da chave. (Busca anônima do consumidor segue no front/SSG,
  fora desta API.)
- ✅ **`POST /bookings` via parceiro:** a reserva criada por chave é **atribuída à empresa** (ator =
  parceiro, gateado por `bookings:write`), **sem** JWT de consumidor. Dados de contato do cliente são
  opcionais no corpo. Detalhar o ajuste em `create_booking_atomic`/`create-booking` na implementação
  (conecta com booking-flow).

**Em aberto (não bloqueiam a Fase 1):**
- [ ] **Rate-limit:** mecanismo (KV vs Durable Object) e limites por plano/parceiro.
- [ ] **`api_request_log`:** entra já na Fase 1 ou 1.1? Retenção/rollup (conecta E4.1).
- [ ] **Webhooks (E2.6):** contrato de eventos e `webhooks:write` — detalhar quando E2.6 começar.
