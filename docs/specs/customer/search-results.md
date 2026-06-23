# Página de resultados — `/search`

> Onde o cliente compara vagas de várias estacionamentos pra uma mesma busca.

---

## 1. URL canônica

```
/search?dest=GRU&from=2026-06-10T22:00:00Z&to=2026-06-15T08:00:00Z&vehicle=car&pax=2&sort=price_asc&view=list
```

| Param | Tipo | Default | Função |
|---|---|---|---|
| `dest` | IATA (3 letras) ou cidade slug | — | obrigatório |
| `from` | ISO datetime UTC | — | obrigatório |
| `to` | ISO datetime UTC | — | obrigatório |
| `vehicle` | `car` \| `motorcycle` | `car` | filtro |
| `pax` | int 1–9 | 1 | passageiros (só relevante se `location.has_passenger_quantity`) |
| `pcd` | `true`\|`false` | `false` | (se aplicável) |
| `category` | code do `parking_type` (csv) | — | filtro de tipo |
| `operator` | slug (csv) | — | filtro de estacionamento |
| `max_distance_km` | int | — | filtro de distância |
| `sort` | `price_asc`\|`price_desc`\|`distance_asc`\|`rating_desc` | `price_asc` | |
| `view` | `list`\|`map` | `list` | |

URLs canônicas com `dest` + `from` + `to` são **indexáveis** se a Movepark optar por SEO.

---

## 2. Layout (desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│ Topbar com barra de busca colapsada (sticky)                    │
├─────────────────────────────────────────────────────────────────┤
│ [Filtros ▾]  17 vagas em GRU · 10 a 15 jun (5 diárias) [Mapa ▭]│
│                                                                 │
│ [Pills: Coberta] [Descoberta] [Valet] [Premium] [Moto]         │
├──────────────────────────┬──────────────────────────────────────┤
│                          │                                      │
│  Filtros laterais        │   Cards (3 colunas)                  │
│  (sidebar 280px)         │   ┌────┐ ┌────┐ ┌────┐               │
│                          │   │ 1  │ │ 2  │ │ 3  │               │
│  • Preço                 │   └────┘ └────┘ └────┘               │
│  • Distância             │   ┌────┐ ┌────┐ ┌────┐               │
│  • Estacionamento             │   │ 4  │ │ 5  │ │ 6  │               │
│  • Amenidades            │   └────┘ └────┘ └────┘               │
│  • Política              │                                      │
│  • Avaliação             │   [Carregar mais]                    │
│                          │                                      │
└──────────────────────────┴──────────────────────────────────────┘
```

**Quando view=map**: a sidebar de filtros some, o conteúdo divide em **lista 50% / mapa 50%** (split horizontal).

---

## 3. Sticky topbar de busca

A pill da busca aparece de forma **persistente** no topbar (não no hero). Click em qualquer segmento abre o popover correspondente e re-submete a busca ao confirmar.

Subtítulo abaixo da pill, dentro do header de resultados:

```
17 vagas em Aeroporto de Guarulhos · 10 a 15 jun · 5 diárias [editar]
```

`editar` é um botão `ghost` que abre a busca em modal pra alterar tudo de uma vez.

---

## 4. Barra de pills de categoria

Rola horizontal. Cada pill = um `parking_type.code`. Toggle adiciona/remove `category=` da URL.

Cores: inativo `bg-surface-soft text-ink`, ativo `bg-mp-navy text-white`.

---

## 5. Filtros laterais (desktop)

| Filtro | UI | URL param |
|---|---|---|
| Preço | Range slider R$ 0–500 | `price_min`, `price_max` |
| Distância do aeroporto | Range slider 0–10 km + lista de checkboxes (até 1km, 1–3km, 3km+) | `max_distance_km` |
| Estacionamento | Lista de checkboxes com logo + nome (mostra contador por estacionamento) | `operator=slug,slug` |
| Amenidades | Checkboxes (Shuttle, Coberto, 24h, Lavagem, Self-park, Valet) | `amenities=…` |
| Tempo de shuttle | "≤ 5 min", "≤ 10 min", "≤ 15 min" | `max_shuttle_min` |
| Política | "Cancelamento grátis", "Reembolsável" | `flexible_only=true` |
| Avaliação | Estrelas 4+, 3+, 2+, 1+ | `min_rating=4` |

Footer da sidebar: botão `[Limpar tudo]` + contador "12 filtros ativos".

**Mobile/tablet**: filtros viram bottom sheet `[Filtros ▾]` no topo.

---

## 6. Card de resultado (`{component.property-card}`)

```
┌─────────────────────────────────────┐
│ ╔═══════════════════════════╗ [♡]   │
│ ║                           ║       │
│ ║   [foto carousel 4:3]     ║       │
│ ║       ◯ ◯ ● ◯ ◯           ║       │
│ ║                           ║       │
│ ║   [Vaga favorita]         ║       │
│ ╚═══════════════════════════╝       │
│                                     │
│ Vaga coberta · Aerovalet            │  title-md ink
│ Aeroporto de Guarulhos · 1,2 km     │  body-sm muted
│ Shuttle 24h · Coberto               │  body-sm muted
│ ★ 4,81 · 248 avaliações             │  body-sm ink (ink rating)
│                                     │
│                       R$ 159,50     │  display-sm ink right-aligned
│                       5 diárias     │  caption muted
└─────────────────────────────────────┘
```

### Detalhes
- **Foto**: aspecto 4:3, `rounded-md`, com carrossel de dots overlay no bottom-center (até 5 fotos).
- **Heart** top-right (32×32 círculo branco com hairline): salva pro favoritos. Quando saved, fill `mp-red`.
- **"Vaga favorita"** badge pill top-left, fonte 11px / 600, branco com shadow tier.
- **Title** em `title-md`: `{nome do tipo de vaga} · {estacionamento}`.
- **Meta line 1**: localização + distância.
- **Meta line 2**: até 3 amenidades-chave separadas por `·`.
- **Rating**: estrela preenchida `★` em `ink` (não amarela), rating com vírgula, "N avaliações" muted.
- **Preço**: total da estadia em `display-sm ink`, com "5 diárias" abaixo em caption muted. Se há `old_price`, mostra riscado acima.
- **Hover**: `shadow-tier`, sem transform.

### Badges comparativos (PRD-13)

✅ **Implementado.** Pills sobrepostos no canto **inferior-esquerdo** da foto que
destacam o critério de compra vencedor de cada card — tiram o foco do "só preço".

- **Relativos ao conjunto** de resultados, não fixos por unidade:
  - **"Mais barato"** (🏷️ `Tag`): menor `price.total` da lista.
  - **"Mais perto"** / **"Mais perto do {terminal}"** (📍 `MapPin`): menor distância
    (`location.distance_km`, com fallback pro `nearest_terminal.distance_km`). O rótulo
    cita o terminal quando há `nearest_terminal` (PRD-09).
- **De atributo** (flags do `parking_type`/amenidades):
  - **"Traslado grátis"** (🚐 `BusFront`): amenidade `shuttle_free`.
  - **"Coberto"** (`Umbrella`): `parking_type.code === "covered"` ou amenidade `covered`.
  - **"Valet"** (`ConciergeBell`): `parking_type.code === "valet"` ou amenidade `valet`.
- **Regras de ruído**: no máximo **2 badges por card**, comparativos primeiro
  (ordem: `cheapest → closest → shuttle → covered → valet`). Comparativos só aparecem
  com **≥2 lotes compráveis** e quando há **variação real** (se todos têm o mesmo
  preço/distância, ninguém ganha o badge). Lote **esgotado não recebe badge**, e o
  universo comparável ignora esgotados (o "mais barato" é o mais barato entre os
  disponíveis).
- **Estilo**: comparativos em pill sólido `bg-mp-red text-white`; atributos em pill
  claro `bg-canvas/95 text-ink`. Ambos com `shadow-tier`.

Cálculo em `src/features/search/searchBadges.ts` (lógica pura, testada em Vitest),
render em `ResultBadges.tsx`. Computado na rota `/search` sobre `data.results` e passado
ao `ResultCard` via prop `badges`. Referência de UX: Parclick (Closer / Cheaper / Free shuttle).

### Click
Click no card → `/p/:operatorSlug/:locationSlug/:parkingTypeCode?from=…&to=…&pax=…` (passa params da busca).

### Vagas sem foto
Placeholder com ícone genérico (`Car`) sobre `bg-surface-soft` + texto "Foto em breve" — não desabilita o card.

---

## 7. Visão mapa

Click no toggle `[Mapa ▭]` no header. Layout vira split 50/50:

- **Esquerda (lista)**: scroll vertical, cards um pouco mais compactos (sem badge "Vaga favorita" pra economizar espaço).
- **Direita (mapa)**: MapLibre com tiles abertos. Pin = estacionamento. Cor do pin = `mp-red`. Tamanho 32×40 (typical map pin shape). Hover/click no card destaca o pin correspondente (anel `mp-navy` ao redor).

### Comportamento do mapa
- Zoom inicial ajustado pra mostrar todos os pins.
- Cluster quando há > 8 pins próximos.
- Click no pin: abre **mini-card flutuante** sobre o mapa com foto, título, preço, "Ver detalhes".
- Bounds change → URL ganha `bbox=lat1,lng1,lat2,lng2`. Botão "Buscar nesta área" aparece quando o usuário move o mapa significativamente.

### Stack do mapa — decisão técnica

**Cliente**: [MapLibre GL JS](https://maplibre.org/) — fork open-source do Mapbox GL JS, mantido por fundação independente. Bundle ~200KB gzipped, renderiza via WebGL, suporta vector tiles, estilo via JSON. Trocar de tile provider depois é mudar 1 URL no style.

**Tile provider (Fase 1 — MVP)**: [MapTiler Cloud](https://www.maptiler.com/cloud/).
- **Free tier**: 100k tile loads / mês (~10k sessões com mapa).
- Acima: **US$ 0,50 / 1000 tile loads** (5–10× mais barato que Mapbox ou Google).
- **MapTiler Studio** permite criar style customizado "Movepark Light" e exportar JSON.
- Geocoder embutido — reaproveitável no autocomplete de aeroportos/endereços da search bar.

**Tile provider (Fase 3 — escala, > 100k sessões/mês)**: [Protomaps](https://protomaps.com/) self-hosted (`.pmtiles` em Cloudflare R2 ou S3).
- Migração trivial — só troca a URL da source no MapLibre.
- Custo despenca pra ~US$ 20/mês mesmo com 50M+ tile loads.

**Por que não Google Maps / Mapbox**:
- Google: US$ 7 / 1000 map loads + paleta engessada + branding obrigatório.
- Mapbox: ~3× mais caro que MapTiler, sem vantagem técnica relevante (MapLibre dá o mesmo client gratuito).
- Airbnb usou Mapbox historicamente (saiu do Google em 2017 por custo), mas tem squad dedicado e volume que justifica enterprise deal. Não é o nosso caso.

### Style do mapa
Discreto — o destaque visual deve ser **os pins**, não o terreno.

| Camada | Cor |
|---|---|
| Fundo terrestre | `#ffffff` / `#f7f7f8` |
| Água | `--mp-pale` (`#E4F2FF`) |
| Parques / áreas verdes | tom muito claro de `surface-soft` |
| Ruas principais | `hairline` 1px |
| Rótulos | `body-sm muted` em Roboto (se MapTiler aceitar custom font; senão Inter) |
| Pin de estacionamento | gota 32×40 `mp-red` `#DA455E` com ícone car branco |
| Pin do aeroporto / destino | ícone outline em `mp-navy`, não-clicável |
| Cluster | círculo `mp-navy` 40px com contador branco |
| Pin em hover | mesmo pin com anel 2px `mp-navy` ao redor |

### Mobile
View mapa em mobile: lista colapsa em **bottom sheet drag-up**. Mapa preenche viewport. Pode arrastar pra cima pra ver cards.

---

## 8. Ordenação

Dropdown no topo-direito do header:

| Opção | URL param |
|---|---|
| Menor preço | `sort=price_asc` (default) |
| Maior preço | `sort=price_desc` |
| Mais próximo | `sort=distance_asc` |
| Melhor avaliação | `sort=rating_desc` |

---

## 9. Paginação

Padrão Airbnb: **infinite scroll** com botão "Carregar mais" no rodapé. 12 cards por "página".

Vire infinite scroll quando o usuário rolar até 80% do conteúdo (intersection observer).

---

## 10. Estados

### Loading inicial
Skeletons de cards (6 unidades, mesma altura ~360 px). Filtros laterais skeletonizam também.

### Empty (sem resultados)
```
┌─────────────────────────────────────────┐
│   [ilustração simples de mapa]          │
│   Nenhuma vaga disponível pra esse      │
│   período em Aeroporto de Guarulhos.    │
│                                         │
│   • Tente outras datas próximas         │
│   • Remova filtros aplicados            │
│   • Busque por uma cidade vizinha       │
│                                         │
│           [Limpar filtros]              │
└─────────────────────────────────────────┘
```

### Error (rede / servidor)
Banner inline no topo do listing:

```
⚠ Tivemos um problema ao buscar. [Tentar de novo]
```

Mantém cards previamente carregados se houver.

### Sold out parcial
✅ **Implementado.** A edge `search` calcula disponibilidade do período em lote
(`availability_batch`) e devolve `availability { remaining, sold_out, near_capacity,
near_capacity_message }` por result. O `ResultCard` mostra badge "Esgotado pro seu período",
card em `opacity-60` e sem clique quando `sold_out`; pill de quase-lotação caso contrário.
Esgotados vão para o fim da lista (qualquer `sort`). Ver [capacity-rules.md](../capacity-rules.md).
(Sugestões "datas próximas" seguem como evolução.)

---

## 11. Performance e UX

- **Debounce** de 300 ms ao alterar filtros na sidebar antes de re-fetch.
- Cache por URL via React Query (`queryKey: ['search', searchParams]`).
- **Prefetch** dos top-3 resultados (listing detail) ao hover ≥ 300 ms.
- Imagens: lazy-load + `loading="lazy"` + tamanhos responsivos.
- Mapa só carrega quando view=map (code-split).

---

## 12. Acessibilidade

- Toggle list/map: `aria-pressed` em ambos os botões.
- Pins do mapa: tab-navegáveis, com `aria-label="Vaga coberta Aerovalet · R$ 159,50"`.
- Heart save: `aria-label="Salvar pra favoritos"`.
- Anúncio com `aria-live="polite"` quando contador de resultados muda ("17 vagas encontradas").

---

## 13. Componentes referenciados

| Componente | Origem |
|---|---|
| `{component.search-bar-pill}` (colapsada) | design-tokens |
| `{component.property-card}` | design-tokens |
| `{component.guest-favorite-badge}` | design-tokens |
| `{component.icon-button-circle}` (heart) | design-tokens |
| `{component.date-picker-day}` (no popover de edição) | design-tokens |

---

## 14. Open points

- [ ] **Cálculo de distância**: precisa de coordenadas no `location` (lat/lng — já temos colunas). Calcular distância via PostGIS no Postgres OU client-side. Provavelmente backend via Edge Function que retorna `distance_km` por result.
- [ ] **Tempo de shuttle**: virou um campo em `location` no Hub? Hoje não temos — precisa adicionar `shuttle_minutes` em `location` (futuro).
- [x] **Reviews/Rating**: implementado (PRD-08 — ver [reviews.md](../reviews.md)). Card mostra `★ avg · N avaliações` (some sem dados); `sort=rating_desc` e filtro `min_rating` no edge `search`.
- [ ] **Amenidades**: precisa modelar como? Tabela `location_amenity (location_id, amenity_code)` ou campo JSON em `location.amenities`?
- [ ] **Pricing por card**: pra cada card no resultado, precisamos chamar `simulate_price(operator_slug, location_slug, parking_type_code, days)`. Se temos 17 resultados → 17 RPCs. Solução: criar uma RPC `simulate_price_batch` ou retornar tudo numa Edge Function `/search`.
- [ ] **Wishlist persistente**: tabela `profile_saved (profile_id, location_parking_type_id, created_at)`. Anônimo: localStorage.
- [x] **Provider de mapa**: decidido — MapLibre GL JS + MapTiler Cloud no MVP, migra pra Protomaps self-hosted quando escalar. Ver §7 acima.
