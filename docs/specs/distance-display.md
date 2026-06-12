# Exibição de distância e proximidade (PRD-09)

> Status: ✅ Implementado. Camada de **exibição** — consome as fundações de dados
> [DAT-04](./location-destination-proximity.md) (lote ↔ destino) e
> [DAT-05](./destination-points.md) (terminais). **Tudo calculado no banco (PostGIS · ADR-001),
> nada digitado, nada calculado no frontend.** Destrava os badges de [PRD-13] e alimenta a
> ordenação por proximidade.

## O que é

Em estacionamento de aeroporto a decisão é **proximidade ao terminal certo**, não só preço — quem
voa pelo T3 não quer o lote que serve o T1. Esta entrega **exibe** a distância/proximidade ao
aeroporto e ao terminal no **card de busca** e no **detalhe**, e usa a proximidade para **ordenar**.

> **Distância calculada ≠ traslado.** O número que o cliente vive como tempo de chegada é o
> **traslado** (operacional, PRD-11). A distância haversine desta spec é **em linha reta** e serve
> para **ordenar/rotular** e para os **badges**. A UI deixa isso explícito ("não é o tempo de
> traslado").

## Onde aparece

| Superfície | O que mostra | Fonte |
|---|---|---|
| **Card de busca** (`ResultCard`) | "📍 mais perto do **T2** · 480 m" + "· 1,2 km" (ao destino) | resposta do Edge `search` (`location.distance_km` + `location.nearest_terminal`) |
| **Detalhe** (`ListingPage` → seção "Onde fica") | lista **por terminal** (T1/T2/T3) com distância e o mais perto destacado | view `location_point_proximity` (DAT-05) via `useLocationTerminals` |
| **Ordenação** | `sort=distance_asc` ordena por distância ao destino buscado | já existente no `search` |

## Contrato de dados

### Edge `search` — `location.nearest_terminal`

Quando a busca tem um ponto (`dest=GRU` ou `dest_lat/lng`), o `search` chama a RPC
**`locations_proximity(p_lat, p_lng, p_destination_id)`** (PostGIS, `ST_Distance`) que devolve, por
lote, a distância ao destino **e** o terminal mais próximo (DAT-05). O Edge **só repassa** — nenhum
cálculo de geo em TS (ADR-001). Acrescenta ao shape de cada resultado:

```jsonc
"location": {
  "distance_km": 1.2,                                   // ao centro do destino (DAT-04)
  "nearest_terminal": { "name": "Terminal 2", "distance_km": 0.48 }  // null se destino sem terminais / lote sem geo
}
```

- `nearest_terminal` é **null** quando: o destino não tem terminais (aeroporto de 1 terminal —
  vale a distância ao centro), o lote não tem geo, ou a busca foi por lat/lng sem `dest`.
- A distância sai de `ST_Distance` em `geography` (metros corretos, curvatura) — a RPC é
  **testada** em pgTAP (`location_destination.test.sql`). Sem API, sem haversine manual.

### Detalhe — view `location_point_proximity`

A página de detalhe lê a view da DAT-05 filtrando por `location_id`, ordenando por `sort_order`:
`point_name`, `point_type`, `distance_km`, `is_nearest`. O `is_nearest` (calculado no banco) marca
o terminal mais perto **daquele** lote — o componente o destaca com o selo "mais perto".

## Camada de aplicação

- **`public.locations_proximity` (RPC, PostGIS)** — distância + terminal mais próximo por lote,
  no banco. O Edge `search/index.ts` chama a RPC e só **repassa** o resultado (sem geo em TS).
- **`src/features/search/useSearchResults.ts`** — tipo `location.nearest_terminal`.
- **`src/features/search/ResultCard.tsx`** — badge "📍 mais perto do {Tx} · {dist}".
- **`src/features/listing/api.ts`** — `useLocationTerminals(locationId)` lê
  `location_point_proximity`; tipo `TerminalDistance`.
- **`src/features/listing/TerminalDistances.tsx`** — `TerminalDistancesView` (apresentação pura,
  destaca o `is_nearest`) + container; renderizado na seção "Onde fica" do detalhe.

## Conexão com outras specs

- **DAT-04 / DAT-05** — fundações de dados (elo lote↔destino e terminais). Esta spec é a
  **leitura/exibição** delas; não cria schema.
- **PRD-13 (badges)** — o `nearest_terminal`/`is_nearest` é o insumo do badge "mais perto do Tx".
- **PRD-11 (traslado)** — tempo de traslado é campo operacional **separado**; a UI distingue.

## Testes

| Camada | Arquivo | Cobre |
|---|---|---|
| Banco / regra (pgTAP) | `supabase/tests/location_destination.test.sql` | RPC `locations_proximity` (PostGIS): distância pequena ao destino, `nearest_terminal` null quando o destino não tem pontos, lote sem geo ausente. |
| Componente (Vitest + RTL) | `src/features/search/ResultCard.test.tsx` | badge "mais perto do Tx" aparece com `nearest_terminal` e some sem ele. |
| Componente (Vitest + RTL) | `src/features/listing/TerminalDistances.test.tsx` | lista por terminal, destaque do mais perto, distância formatada; vazio → não renderiza. |

Mudou a exibição/contrato de distância → atualize esta spec no mesmo PR.
