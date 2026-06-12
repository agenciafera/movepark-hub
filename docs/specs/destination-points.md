# Pontos do destino (terminais) + distância por terminal (DAT-05)

> Status: ✅ Implementado — migration `20260617000000_destination_point.sql`.
> Fundação de dados (Onda 1). Complementa [DAT-04](./location-destination-proximity.md) (lote ↔
> destino) e destrava a **granularidade por terminal** de PRD-09/PRD-13 e o autocomplete por
> terminal na busca. Lê-se junto de [destinations.md](./destinations.md).

## O que é

Um **`destination`** guarda **uma só geo** (o centro do aeroporto). Mas o viajante decide por
proximidade ao **seu terminal**, não ao centro — "estacionamento do **Terminal 2** de Guarulhos"
é busca de alta intenção. O **`destination_point`** modela os **pontos físicos** de um destino
(T1/T2/T3, píer, plataforma) para responder "📍 mais perto do T2" e "6 min ao T3".

A distância lote → terminal é **haversine em SQL** — a mesma do DAT-04, só trocando o alvo (o
ponto, não o centro). **Sem API externa, sem PostGIS, calculada.**

> O que o **cliente vê** como tempo de chegada é o **traslado** (operacional, PRD-11). A distância
> por terminal serve para **ordenar/rotular** e para o **autocomplete por terminal** — não é o
> traslado.

## Quais destinos precisam de pontos

Só os **multi-terminal**. Aeroporto/rodoviária de um terminal só roda com a proximidade ao centro
do DAT-04 — **não precisa** de `destination_point`.

| Destino | Terminais | Precisa de pontos? |
|---|---|---|
| **GRU — Guarulhos** | T1, T2, T3 | ✅ **Sim (3 pontos)** |
| VCP — Viracopos | 1 (TPS único) | ❌ usa o centro |
| CGH — Congonhas | 1 | ❌ usa o centro |
| CWB — Afonso Pena | 1 | ❌ usa o centro |
| Rodoviária Tietê | 1 | ❌ usa o centro |

→ **Hoje só o GRU** tem pontos (T1/T2/T3). O T3 segue em expansão (píer T3B até fim de 2026), mas
continua sendo T3 — um ponto.

## Modelo de dados

```
destination (dono da geo: 1 centro)
└── destination_point  (0..N pontos)        ← NOVO
    ├── destination_id  uuid not null  FK → destination(id) ON DELETE CASCADE
    ├── name            text   "Terminal 1" / "T2" / "Píer Sul"
    ├── type            text   check in (terminal | gate | pier | platform | other)  default 'terminal'
    ├── latitude        numeric not null
    ├── longitude       numeric not null
    ├── sort_order      int    default 100
    └── unique (destination_id, name)
```

- **`ON DELETE CASCADE`** — pontos são filhos do destino; apagar o destino apaga os pontos.
- **`type` text + CHECK** (não enum) — espelha `destination.type` e mantém o modelo **extensível**
  sem `ALTER TYPE` (porto = `pier`, rodoviária = `platform`).
- **Hard delete** (sem `deleted_at`) — igual à tabela-pai `destination`: dado de referência
  gerido pelo `hub_admin`, poucas linhas. Decisão deliberada de consistência com o destino.
- **`unique (destination_id, name)`** — sem terminal duplicado e idempotência do seed.
- **Índice** `destination_point_destination_id_idx (destination_id, sort_order)`.

### RLS

Espelha `destination`: leitura pública, escrita só `hub_admin`.

| Policy | Cmd | Regra |
|---|---|---|
| `destination_point_select` | select | `using (true)` — catálogo público. |
| `destination_point_admin_write` | all | `is_hub_admin()` (using + with check). |

## Distância por terminal

Reaproveita **`haversine_km`** do DAT-04. Dois objetos novos:

| Objeto | Assinatura | Uso |
|---|---|---|
| `nearest_destination_point` | `(p_lat numeric, p_lng numeric, p_destination_id uuid) → uuid` | id do ponto **mais próximo** daquele destino; `null` se o destino não tem pontos ou geo nula. STABLE. Usado pela view (`is_nearest`) e pelo badge "mais perto do Tx". |
| `location_point_proximity` (view) | — | **uma linha por (lote, ponto do destino do lote)** com a distância on-the-fly. |

### View `location_point_proximity` (`security_invoker = true`)

```sql
location_point_proximity
├── location_id
├── destination_id
├── destination_point_id
├── point_name            -- "Terminal 2"
├── point_type            -- terminal | pier | …
├── sort_order
├── distance_km           -- haversine(location.geo, point.geo), 2 casas
└── is_nearest            -- true no ponto mais perto deste lote (badge "mais perto do T2")
```

- **`INNER JOIN`** com `destination_point`: lote cujo destino **não tem pontos** simplesmente
  **não aparece** (consumidor cai no DAT-04, distância ao centro).
- **`is_nearest`** marca exatamente **um** ponto por lote — é o que o badge "📍 mais perto do T2"
  consome direto, sem o cliente recalcular.
- **`security_invoker`**: respeita a RLS de `location` + `destination_point` (ambas públicas para
  lotes ativos) — lível por `anon`/`customer`, que é o que PRD-09/PRD-13 precisam no consumidor.

## Seed dos terminais do GRU

3 pontos (T1/T2/T3) populados na migration e no `seed.sql`, com **lookup por `code = 'GRU'`**
(não cravar id gerado) e `ON CONFLICT (destination_id, name) DO NOTHING` (idempotente). Geo
**aproximada** levantada via Google Maps (jun/2026), **refinável no Manager** — a distância serve
para ordenar/rotular, não exige precisão de metro.

| Ponto | latitude | longitude |
|---|---|---|
| Terminal 1 | -23.4336 | -46.4806 |
| Terminal 2 | -23.4327 | -46.4730 |
| Terminal 3 | -23.4316 | -46.4690 |

## Camada de aplicação

- **`src/types/domain.ts`** — `DestinationPoint = Tables<"destination_point">` e
  `LocationPointProximity = Tables<"location_point_proximity">` (view).
- **`src/features/destinations/api.ts`** — `useDestinationPoints(destinationId)` (leitura
  ordenada) + mutations `useCreateDestinationPoint` / `useUpdateDestinationPoint` /
  `useDeleteDestinationPoint`, invalidando a key `points(destinationId)`.
- **`src/features/destinations/DestinationPointsDialog.tsx`** — gestão dos terminais (listar,
  adicionar, editar, excluir) aberta pelo botão **"Terminais"** na tabela de destinos do Manager
  (`src/routes/manager/destinations.tsx`). Toda a área já é `hub_admin` (RequireRole no shell).

## Conexão com outras specs

- **DAT-04** ([location-destination-proximity.md](./location-destination-proximity.md)) — define o
  elo lote ↔ destino e a proximidade ao **centro**. Esta DAT-05 refina para a proximidade ao
  **ponto** (terminal). Mesma `haversine_km`.
- **PRD-09 / PRD-13** — consomem `location_point_proximity` para "X km do T2" e o badge
  "mais perto do T2". A granularidade por terminal vem daqui.
- **`search` (Edge Function)** — autocomplete/filtro por terminal pode usar os pontos no futuro;
  o `search` não muda nesta DAT-05.
- **PRD-11 (traslado)** — tempo exibido ao cliente é campo operacional **separado**; não confundir
  com a distância por terminal.

## Testes

| Camada | Arquivo | Cobre |
|---|---|---|
| Banco / regra (pgTAP) | `supabase/tests/destination_point.test.sql` | `nearest_destination_point` (ponto certo + lat nula → null), view `location_point_proximity` (1 linha por ponto, `is_nearest` único e correto, distância pequena, lote some sob destino alheio), CHECK de `type`, UNIQUE `(destination_id,name)`, CASCADE no delete do destino, RLS (anon lê a view, anon **não** escreve). |
| Componente (Vitest + RTL) | `src/features/destinations/DestinationPointsDialog.test.tsx` | dialog mostra título + formulário de adicionar terminal; pede para salvar o destino antes quando não há id. |

Mudou a regra de pontos/distância por terminal → atualize esta spec no mesmo PR.
