# Vínculo location ↔ destination + proximidade (DAT-04)

> Status: ✅ Implementado — migrations `20260616000000_location_destination_link.sql` +
> `20260618000000_geo_postgis.sql` (migrou a proximidade para PostGIS · **ADR-001**).
> Fundação de dados (Onda 1). Destrava **PRD-09** (exibir distância) e **PRD-13** (badge
> "mais perto"). Lê-se junto de [destinations.md](./destinations.md). A granularidade por
> **terminal** (T1/T2/T3) vem da [DAT-05](./destination-points.md), que reaproveita a infra
> PostGIS daqui.
>
> **ADR-001 · Geo no banco com PostGIS.** Toda distância/proximidade ("mais próximo", raio) é
> calculada no Postgres com PostGIS (`geography(Point)`, `ST_Distance`/`ST_DWithin`, índice GiST)
> — **nunca no frontend**. O frontend só exibe; o valor existe em query e em build (SSG/JSON-LD).

## O que é

O **`destination`** (aeroporto, rodoviária, centro…) é o **dono da geo**: já tem
`latitude`/`longitude`/`type`/`slug`/SEO. Cada **`location`** (lote/unidade física) passa a
**apontar** para o seu destino-âncora via **`location.destination_id`**. Com o elo no lugar, a
**proximidade** (lote → destino) sai **automática** por **`ST_Distance` (PostGIS)** sobre as
colunas `geography` — sem API externa, sem ninguém digitar distância em 17 lotes.

A proximidade aqui é a distância **geográfica** lote→destino, usada para **ranquear** resultados
("mais perto de Guarulhos") e renderizar o **badge "mais perto"**. O que o **cliente vê** como
tempo de traslado é campo **operacional** (PRD-11), e **não** é isto.

## Modelo de dados

```
location
├── … (company_id, name, slug, latitude, longitude, …)
└── destination_id  uuid null  FK → destination(id) ON DELETE SET NULL   ← NOVO
```

- **`location.destination_id`** — destino-âncora do lote. **Nullable**: um lote sem geo
  (ex.: `latitude/longitude` nulos) ou sem destino próximo fica `null`.
- **Índice** `location_destination_id_idx (destination_id)`.
- A `location` continua dona da sua própria geo (`latitude`/`longitude`); o `destination_id`
  é só o **ponteiro** para o destino, não copia a geo.

### Como o vínculo é preenchido

| Caminho | Quando | Mecanismo |
|---|---|---|
| **Backfill** | uma vez, na migration | `UPDATE` liga cada lote existente ao **destino mais próximo** (`nearest_destination`), respeitando o teto de `100 km`. |
| **Auto-fill** | todo `INSERT` de lote novo | trigger `location_set_destination_trg` (BEFORE INSERT): se `destination_id` veio nulo **e** o lote tem geo, preenche com o mais próximo. |
| **Override manual** | a qualquer momento | `hub_admin` define `destination_id` à mão no Manager (lote excepcional). Override **sempre vence** — a trigger só age quando o campo vem nulo, e nunca sobrescreve em `UPDATE`. |

> **Por que trigger só em INSERT.** Auto-fill cobre o caso comum ("lote novo perto do
> aeroporto" → liga sozinho) sem nunca pisar num override. Mudou a geo de um lote já existente?
> O re-vínculo é ação **manual** no Manager (ou re-rodar o backfill) — decisão deliberada para
> não desfazer overrides silenciosamente.

## Distância no banco — PostGIS (ADR-001)

Cada `destination`, `location` e `destination_point` ganha uma coluna **gerada**
`geog geography(Point, 4326)` (derivada de `latitude`/`longitude`, `null` sem geo) com **índice
GiST**. `ST_Distance` em `geography` já devolve **metros corretos** (curvatura) — sem haversine
na mão, sem `cube`/`earthdistance`. O `haversine_km` manual da 1ª versão foi **removido**.

```sql
-- coluna gerada (idem em location e destination_point)
alter table destination add column geog geography(Point,4326)
  generated always as (st_setsrid(st_makepoint(longitude, latitude), 4326)::geography) stored;
create index destination_geog_idx on destination using gist (geog);
```

Funções de apoio (todas em PostGIS):

| Função | Assinatura | Uso |
|---|---|---|
| `nearest_destination` | `(p_lat numeric, p_lng numeric, p_max_km numeric default 100) → uuid` | id do destino **publicado** mais próximo dentro do teto (`ST_DWithin` + `ST_Distance`); `null` se nenhum. STABLE. Usada no backfill, na trigger e pelo Manager ("detectar mais próximo"). |
| `locations_proximity` | `(p_lat numeric, p_lng numeric, p_destination_id uuid default null) → setof (location_id, distance_km, nearest_terminal_name, nearest_terminal_distance_km)` | proximidade de **todos os lotes** a um ponto buscado + terminal mais próximo (DAT-05), tudo em PostGIS. Consumida pelo Edge `search` (PRD-09) — o frontend só repassa. |

## Exposição da proximidade — view `location_proximity`

Em vez de cravar a distância numa coluna (cache que envelhece quando a geo muda), a proximidade
é **calculada on-the-fly** numa view — sempre correta, zero manutenção, custo desprezível
(~dezenas de lotes):

```sql
public.location_proximity  (security_invoker = true)
├── location_id
├── destination_id
├── destination_code, destination_name, destination_short_name, destination_type
└── distance_km            -- ST_Distance(location.geog, destination.geog)/1000, 2 casas; null sem geo/sem destino
```

- **`security_invoker = true`**: a view respeita a RLS das tabelas-base. `location` é legível
  publicamente (`catalog_read_location`: ativo + não deletado) e `destination` idem
  (`destination_select`); logo a view é lível por `anon`/`customer` para lotes ativos — o que
  PRD-09/PRD-13 precisam no consumidor.
- Quem quiser **embed** direto (PostgREST) usa a FK: `location?select=*,destination(code,name,short_name,latitude,longitude)`.

> Cache só se um dia ordenar por distância em volume alto (a "dica de dev" da DAT-04). Não é o
> caso no MVP — recalcular é mais barato que invalidar.

## Camada de aplicação

- **`src/types/domain.ts`** — `LocationProximity = Tables<"location_proximity">` (view) e
  `LocationWithDestination` (location + relação `destination` embarcada).
- **`src/features/locations/api.ts`** — leituras passam a embarcar `destination(...)`;
  `useUpdateLocation`/`useCreateLocation` aceitam `destination_id`; `useNearestDestination()`
  expõe a RPC para o botão "detectar mais próximo".
- **`src/features/locations/LocationForm.tsx`** — seletor **"Destino (âncora de proximidade)"**
  visível só no **full scope** (`hub_admin`); opção "Nenhum" + botão **"Detectar mais próximo"**
  (resolve via `nearest_destination` a partir da geo do lote). `operator` **não** edita o vínculo.

## Conexão com outras specs

- **PRD-09 / PRD-13** — consomem `location_proximity` (ou a relação embarcada) para exibir
  "a X km de <destino>" e o badge "mais perto". Foundation entregue aqui.
- **`search` (Edge Function)** — chama a RPC **`locations_proximity`** (PostGIS) para a distância
  ao **destino buscado** + terminal mais próximo; **não** calcula geo em TS (ADR-001). A view
  `location_proximity` é a distância **fixa** lote→destino-dono, complementar.
- **PRD-11 (traslado)** — tempo de traslado exibido ao cliente é campo operacional **separado**;
  não confundir com a proximidade geográfica desta spec.

## Testes

| Camada | Arquivo | Cobre |
|---|---|---|
| Banco / regra (pgTAP) | `supabase/tests/location_destination.test.sql` | `nearest_destination` (escolhe o destino certo + respeita o teto via `ST_DWithin`), trigger auto-fill no INSERT, override não é sobrescrito, view `location_proximity` (distância + nulos), RPC `locations_proximity` (distância pequena, `nearest_terminal` null sem pontos, lote sem geo ausente), RLS (anon lê a view de lote ativo). |
| Componente (Vitest + RTL) | `src/features/locations/LocationForm.test.tsx` | gating de role: seletor de destino aparece no full scope e some no operator scope. |

Mudou a regra de vínculo/proximidade → atualize esta spec no mesmo PR.
