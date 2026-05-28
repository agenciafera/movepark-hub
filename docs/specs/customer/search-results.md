# Página de resultados — `/search`

> Onde o cliente compara vagas de várias operadoras pra uma mesma busca.

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
| `operator` | slug (csv) | — | filtro de operadora |
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
│  • Operadora             │   │ 4  │ │ 5  │ │ 6  │               │
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
| Operadora | Lista de checkboxes com logo + nome (mostra contador por operadora) | `operator=slug,slug` |
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
- **Title** em `title-md`: `{nome do tipo de vaga} · {operadora}`.
- **Meta line 1**: localização + distância.
- **Meta line 2**: até 3 amenidades-chave separadas por `·`.
- **Rating**: estrela preenchida `★` em `ink` (não amarela), rating com vírgula, "N avaliações" muted.
- **Preço**: total da estadia em `display-sm ink`, com "5 diárias" abaixo em caption muted. Se há `old_price`, mostra riscado acima.
- **Hover**: `shadow-tier`, sem transform.

### Click
Click no card → `/p/:operatorSlug/:locationSlug/:parkingTypeCode?from=…&to=…&pax=…` (passa params da busca).

### Vagas sem foto
Placeholder com ícone genérico (`Car`) sobre `bg-surface-soft` + texto "Foto em breve" — não desabilita o card.

---

## 7. Visão mapa

Click no toggle `[Mapa ▭]` no header. Layout vira split 50/50:

- **Esquerda (lista)**: scroll vertical, cards um pouco mais compactos (sem badge "Vaga favorita" pra economizar espaço).
- **Direita (mapa)**: MapLibre com tiles abertos. Pin = operadora. Cor do pin = `mp-red`. Tamanho 32×40 (typical map pin shape). Hover/click no card destaca o pin correspondente (anel `mp-navy` ao redor).

### Comportamento do mapa
- Zoom inicial ajustado pra mostrar todos os pins.
- Cluster quando há > 8 pins próximos.
- Click no pin: abre **mini-card flutuante** sobre o mapa com foto, título, preço, "Ver detalhes".
- Bounds change → URL ganha `bbox=lat1,lng1,lat2,lng2`. Botão "Buscar nesta área" aparece quando o usuário move o mapa significativamente.

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
Card com badge "Esgotado pro seu período" em `pending` (orange). Card fica em `opacity-60`, sem CTA. Aparece junto com sugestões "Disponíveis em datas próximas (ver)".

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
- [ ] **Reviews/Rating**: tabela `review` ainda não existe. Pra MVP, podemos exibir rating fake ou ocultar a feature.
- [ ] **Amenidades**: precisa modelar como? Tabela `location_amenity (location_id, amenity_code)` ou campo JSON em `location.amenities`?
- [ ] **Pricing por card**: pra cada card no resultado, precisamos chamar `simulate_price(operator_slug, location_slug, parking_type_code, days)`. Se temos 17 resultados → 17 RPCs. Solução: criar uma RPC `simulate_price_batch` ou retornar tudo numa Edge Function `/search`.
- [ ] **Wishlist persistente**: tabela `profile_saved (profile_id, location_parking_type_id, created_at)`. Anônimo: localStorage.
- [ ] Provider de mapa: MapLibre (gratuito, tiles via MapTiler free tier) — confirmar antes de prosseguir.
