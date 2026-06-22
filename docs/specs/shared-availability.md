# Disponibilidade compartilhada Hub ↔ White-label (E2.5.1)

Sincronização de disponibilidade entre o **Movepark Hub** (novo) e o **white-label legado**
(`movepark-backoffice`), que rodam em paralelo e vendem a mesma vaga física. Modelo escolhido:
**duas bases reconciliadas**, sincronizadas **via API autenticada** — nunca banco-com-banco.

## Decisões

- **Duas bases reconciliadas** (não fonte única). Cada sistema conta o seu; sincronizam por API.
  Há janela de divergência inerente — mitigada por push near-real-time + reconciliação (E2.5.2).
- **Relação segura por chave de API**, não por nome: o Bearer (`WL_BACKEND_TOKEN`) é **global** e
  vive nos **secrets do Supabase**; por empresa variam só **domínio** e **tenant** (`X-Tenant`).
- **Via de mão dupla:** o Hub **puxa** a disponibilidade do WL (exibição) e **empurra** o que vende
  (anti-overbooking); o WL faz o inverso (push WL→Hub é o lado dele, fora deste repo).

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

**Dropdown via catálogo do WL:** quando o WL expõe `GET /categories` e `GET /products`
(ver tarefa WL), o Manager mostra **dois selects em cascata** (unidade → tipo) populados ao vivo
pela Edge `wl-sync` modo `catalog`. Enquanto esses endpoints não existem, cai no **fallback de
texto livre** (digitar os slugs). O catálogo é buscado só no Manager (`useWlCatalog`).

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
- **Push (anti-overbooking):** `_shared/wl/push.ts` → `create-booking` empurra **reserve**
  (`external_id = booking_id`) na criação; `cancel-booking` empurra **release** no cancelamento.
  Best-effort (loga em falha, não derruba a reserva); a divergência é pega na reconciliação.

## Fora de escopo (próximos)

- **Push WL→Hub** (o WL avisar o Hub do que vendeu por fora) e a coluna espelho no
  `location_parking_availability` — depende do lado legado (PR próprio do WL).
- **Reconciliação periódica** + log de divergência (**E2.5.2**).
- **Escopo read/write por chave-por-empresa** (hoje token global + `X-Tenant`) — dívida registrada.
