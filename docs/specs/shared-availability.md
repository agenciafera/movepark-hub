# Disponibilidade compartilhada Hub ↔ White-label (E2.5.1 + E2.5.2)

Sincronização de disponibilidade entre o **Movepark Hub** (novo) e o **white-label legado**
(`movepark-backoffice`), que rodam em paralelo e vendem a mesma vaga física. Modelo escolhido:
**duas bases reconciliadas**, sincronizadas **via API autenticada** — nunca banco-com-banco.

## Decisões

- **Duas bases reconciliadas** (não fonte única). Cada sistema conta o seu; sincronizam por API.
  Há janela de divergência inerente — mitigada por push near-real-time + reconciliação (E2.5.2).
- **Relação segura por chave de API**, não por nome: o Bearer (`WL_BACKEND_TOKEN`) é **global** e
  vive nos **secrets do Supabase**; por empresa variam só **domínio** e **tenant** (`X-Tenant`).
- **Via de mão dupla:** o Hub **puxa** a disponibilidade do WL (exibição + reconciliação) e
  **empurra** o que vende (push confiável via outbox). O anti-overbooking é **real** no Hub: a
  reconciliação grava o que o WL vendeu em `external_booked_count` e o `create_booking_atomic`
  conta `booked_count + external_booked_count` contra a capacidade (E2.5.2).
- **WL→Hub por pull (E2.5.2):** em vez de depender do WL chamar o Hub, um **job de reconciliação**
  puxa o `sold_wl` do `GET /availability` e o materializa em `external_booked_count`. Sem mudança no
  contrato do WL. **Hub→WL por outbox + retry** (mesmo padrão do WPS), não mais best-effort inline.

## Configuração (por empresa)

`company.wl_domain` (host, ex.: `ferapark.movepark.com.br`), `company.wl_tenant_key` (= `X-Tenant`),
`company.wl_sync_enabled` (toggle; `CHECK` exige domínio+tenant pra ligar). Editável em
**Manager → Empresas → Integração White-label**. A URL da API é montada como
`https://<wl_domain>/api/v3/backend` (path fixo).

## Mapa de SKU (por tipo de vaga)

O WL conta por `(category, product)`. Cada `location_parking_type` guarda
`wl_category_slug` (unidade) + `wl_product_slug` (tipo de vaga). Editável **só no Manager**
(Movepark) → **Tipos de vaga → Mapeamento White-label** — nunca no painel do operador. Sem
mapeamento, a lpt não sincroniza.

**Dropdown via catálogo do WL (API pública):** o catálogo vem da **API pública/storefront** do WL
(`docs/Movepark v3.0.postman_collection.json`), **sem auth**, multi-tenant por domínio:
- `GET https://<wl_domain>/api/v3/categories?lang=pt-br` → `{ data: [{ slug, name }] }`
- `GET https://<wl_domain>/api/v3/categories/<slug>?lang=pt-br&is_spot=1` → `{ data: { products: [{ slug, name }] } }`

A Edge `wl-sync` modo `catalog` (gateada por empresa, mas **sem precisar do token nem do toggle** —
basta o domínio) lista as categorias e, pra cada uma, seus produtos, e o Manager mostra **dois
selects em cascata** (unidade → tipo). `useWlCatalog` busca só no Manager. Fallback: se o domínio
não responder, cai no texto livre.

## API do WL consumida (contrato do lado legado)

- `GET /api/v3/backend/availability?category_slug&product_slug&start_date&end_date` →
  por dia `{ date, capacity, sold_wl, sold_external, available }`.
- `POST /api/v3/backend/availability/sync` `{ external_id, operation: reserve|release,
  category_slug, product_slug, quantity, start_date, end_date? }` — **idempotente** por
  `(external_id, operation)`. Auth: `Authorization: Bearer <WL_BACKEND_TOKEN>` + `X-Tenant`.

## Implementação no Hub

- **`company.wl_domain/wl_tenant_key/wl_sync_enabled`** — migrations `20260706`/`20260707`.
- **`location_parking_type.wl_category_slug/wl_product_slug`** + RPC **`wl_company_config(company_id)`**
  (SECURITY DEFINER, gateada por `is_hub_admin()` OU `profile_company`) — migration `20260708`.
- **`supabase/functions/_shared/wl/client.ts`** — cliente (normalize domínio, monta URL, GET/POST).
- **Edge `wl-sync`** — pull ao vivo (front): gateia via `wl_company_config` com o JWT do usuário e
  chama o `GET /availability`. Retorna `{ ready, days }`.
- **Pull (exibição):** `useWlExternalOccupancy` chama a `wl-sync` por lpt mapeado **ao abrir a
  Ocupação** e soma `sold_external` nas células (`withExternal` = hub + WL, pct travado em 1).
  Best-effort: WL fora do ar → tela segue mostrando só o hub.
## Anti-overbooking + reconciliação (E2.5.2)

- **Coluna espelho:** `location_parking_availability.external_booked_count integer not null default 0`
  guarda o que o **WL** vendeu por fora (= `sold_wl`). Materializada pela reconciliação, nunca pelo front.
- **Anti-overbooking real no Postgres:** `_create_booking_core` (compartilhado por `create_booking_atomic`
  e `api_create_booking`) lê `external_booked_count` junto do `booked_count` no `SELECT … FOR UPDATE`
  (lock pessimista) e bloqueia quando `booked_count + external_booked_count >= capacity` ("Sem
  disponibilidade"). `check_availability`/`availability_batch` somam o external no `remaining`/`sold_out`,
  então o consumidor para de ver/comprar vaga que o WL já esgotou.
- **Push Hub→WL confiável (outbox + retry):** tabela **`wl_delivery`** (event_id único,
  `operation` reserve|release, payload, `attempts`/`max_attempts`/`next_attempt_at`/backoff). Um
  **trigger** enfileira `reserve` no `INSERT` de `booking_item` (parking) e `release` quando a
  `booking` vira `cancelled` — só com `wl_sync_enabled` + lpt mapeada; idempotente por `event_id`
  (`on conflict do nothing`). A Edge **`wl-deliver`** (cron 1 min, `nextBackoff` exponencial até 4h)
  drena a outbox via `wlPostSync`. Substitui o antigo push inline best-effort (`_shared/wl/push.ts`,
  removido) — `create-booking`/`cancel-booking` não empurram mais direto.
- **Reconciliação WL→Hub (pull):** Edge **`wl-reconcile`** (cron 15 min) percorre cada lpt mapeada de
  empresa com sync ligado, puxa `GET /availability` numa janela (hoje..+90d) e chama a RPC
  **`wl_reconcile_apply(lpt_id, rows)`** (SECURITY DEFINER), que grava `external_booked_count = sold_wl`
  (preserva `booked_count`) e loga divergência em **`wl_reconcile_log`**. É o que torna o
  anti-overbooking real e fecha a janela de divergência.
- **Cron + auth interna:** `20260711010000_wl_cron.sql` agenda ambas via `pg_cron` + `pg_net`
  (`net.http_post`), com a chave interna (`x-wl-deliver-key`) vinda do **Vault** — sem segredo no repo.
  As Edges validam o header e rodam com a service role (`--no-verify-jwt`).

Migrations: **`20260711000000_wl_reconcile_sync.sql`** (coluna + core + outbox + trigger + log + RPC) e
**`20260711010000_wl_cron.sql`** (agendamento).

## Fora de escopo (próximos)

- **Escopo read/write por chave-por-empresa** (hoje token global + `X-Tenant`) — dívida registrada.
- **Ocupação por coluna:** a Ocupação ainda faz pull ao vivo (`wl-sync`) por render; com
  `external_booked_count` no banco, pode passar a ler a coluna (fonte única, menos chamadas ao WL).
