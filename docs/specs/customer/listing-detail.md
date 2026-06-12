# Página de detalhe da vaga — `/p/:operatorSlug/:locationSlug/:parkingTypeCode`

> O equivalente Movepark do "listing detail" do Airbnb.
> Aqui o usuário decide entre **Reservar** ou voltar pra busca.

---

## 1. URL e params

```
/p/aerovalet/aeroporto-guarulhos/covered?from=2026-06-10T22:00:00Z&to=2026-06-15T08:00:00Z&pax=2
```

Os query params **vêm da busca** e populam o `reservation-card`. Se vazios, o card pede que o usuário escolha datas antes de ver o preço.

`operatorSlug + locationSlug + parkingTypeCode` é unique no banco — resolve pro `location_parking_type` específico.

---

## 2. Layout (desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│  Topbar com search bar colapsada (sticky)                       │
├─────────────────────────────────────────────────────────────────┤
│  [‹ Voltar pra busca]                                           │
├─────────────────────────────────────────────────────────────────┤
│  Vaga coberta · Aerovalet Aeroporto de Guarulhos                │  display-lg
│  ★ 4,81 · 248 avaliações · 1,2 km do terminal · GRU             │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────┬───────────┬───────────┐                          │
│  │           │   foto 2  │   foto 3  │                          │
│  │  foto 1   ├───────────┼───────────┤   [Ver todas as fotos ▭] │  Photo
│  │  hero     │   foto 4  │   foto 5  │                          │  grid
│  │           │           │           │                          │
│  └───────────┴───────────┴───────────┘                          │
├──────────────────────────────────────┬──────────────────────────┤
│                                      │  ┌────────────────────┐  │
│  Coberta. Próxima do terminal.       │  │ R$ 159,50          │  │
│  Operada por Aerovalet (5 anos)      │  │ 5 diárias × R$ 31,90│  │
│                                      │  │                    │  │
│  ── divider ──                       │  │ Check-in           │  │
│                                      │  │ [10 jun · 22:00]   │  │  Reservation
│  Sobre essa vaga                     │  │ Check-out          │  │  card (sticky)
│  Texto curto da operadora            │  │ [15 jun · 08:00]   │  │  width 360 px
│                                      │  │ Passageiros [2 ▾]  │  │
│  ── divider ──                       │  │                    │  │
│                                      │  │ ▼ Detalhes do preço│  │
│  O que essa vaga oferece             │  │                    │  │
│  ▢ Coberta  ▢ 24 horas  ▢ Câmeras    │  │ [Reservar agora]   │  │  primary CTA
│  ▢ Shuttle  ▢ Self-park              │  │                    │  │
│                                      │  │ Cancele grátis até │  │  micro-copy
│  ── divider ──                       │  │ 24h antes          │  │
│                                      │  └────────────────────┘  │
│  Avaliações (248)                    │                          │
│  ★ 4,81 — quebrado por critério      │                          │
│  ...                                 │                          │
│                                      │                          │
│  ── divider ──                       │                          │
│                                      │                          │
│  Onde fica                           │                          │
│  [mapa pequeno + endereço]           │                          │
│                                      │                          │
│  ── divider ──                       │                          │
│                                      │                          │
│  Política de cancelamento            │                          │
│                                      │                          │
│  ── divider ──                       │                          │
│                                      │                          │
│  Conheça a operadora                 │                          │
│  Aerovalet · 5 anos na Movepark      │                          │
│  Outras localizações desta operadora │                          │
└──────────────────────────────────────┴──────────────────────────┘
```

**Largura do conteúdo**: `--container-narrow` (1080 px). Coluna esquerda ~64% do conteúdo, coluna direita ~32% com gutter de 4%.

---

## 3. Cabeçalho

### Linha 1 — h1
`display-lg` (22 px / 500). Padrão: `"{parking_type.name} · {operator.name} {location.name}"`. Ex.: "Vaga coberta · Aerovalet Aeroporto de Guarulhos".

### Linha 2 — meta
`body-md` muted. Padrão: `★ {rating} · {n_reviews} avaliações · {distance_km}km do terminal · {IATA}`.

Ícone estrela em ink (4×4), rating com vírgula. Sem avaliações: oculta a parte de rating (não mostra "sem avaliações").

---

## 4. Photo grid

Inspirado no Airbnb. **5 fotos** visíveis no desktop: 1 grande (esquerda, 2 colunas e 2 linhas) + 4 pequenas em grid 2×2 à direita.

- Aspect ratio do bloco: ~16:9 no total.
- Hover: foto escurece levemente; ícone "ampliar" aparece bottom-right.
- Botão **"Ver todas as fotos"** flutuante bottom-right do bloco, com badge `{contador} fotos`.
- Click → modal gallery em scroll vertical com todas as fotos em qualidade alta.

**Mobile**: carrossel horizontal full-bleed com aspect 4:5, dots indicators.

---

## 5. Coluna esquerda (conteúdo)

### 5.1 Sub-cabeçalho compacto
Logo abaixo das fotos, antes do divider:

```
Coberta · 100 vagas disponíveis · Operada por Aerovalet · GRU
```

`title-md`, `ink`. Se a operadora tem badge "Operador verificado", aparece como pill ao final.

### 5.2 Sobre essa vaga
Parágrafo curto (1-3 frases) cadastrado pela operadora em `location.notice` ou similar. Limitado a ~200 chars; "Ler mais" expande inline.

Default genérico se a operadora não preencheu: usa um texto baseado no tipo de vaga ("Vaga coberta, protegida do sol e chuva, ideal pra estadias longas.").

### 5.3 O que essa vaga oferece
Lista 2 colunas de amenidades com ícone outline 24 px à esquerda e label em `body-md ink`.

Ícones-chave: Coberto, 24h, Câmeras, Shuttle, Self-park, Valet, Lavagem, Acessível PCD, Vagas para motos, Carregador elétrico.

Botão "Ver todas as N comodidades" abre modal se houver mais de 8.

### 5.4 Avaliações
`display-md` "Avaliações (N)".

Rating display canônico do design system (`{component.rating-display-card}`):
```
★ 4,81
Coral favorita  · 248 avaliações
```

Quebra por critério em grid 2-col com barra horizontal:
- Localização ★ 4,9
- Limpeza ★ 4,8
- Atendimento ★ 4,9
- Custo-benefício ★ 4,7
- Facilidade de acesso ★ 4,8

Lista de avaliações em **2 colunas** (desktop), cards com:
```
[avatar 40×40]  Maria S.
                Junho 2026
"Estacionei 5 dias. Chegada com shuttle rapidíssima…"
                              [Ler mais]
```

Botão "Ver todas as 248 avaliações" abre modal scroll vertical.

### 5.5 Onde fica
- Endereço completo em `body-md ink`.
- Mini-mapa interativo de 256 px altura, full-width da coluna. **Mesma stack do search** (MapLibre + MapTiler — ver [search-results.md §7](search-results.md#stack-do-mapa--decis%C3%A3o-t%C3%A9cnica)). Pin centralizado na operadora, zoom fixo (~15), interação limitada (sem rolagem; pan permitido). Mesmo style "Movepark Light".
- Para reduzir tile loads, considerar **MapTiler Static Maps API** (imagem PNG renderizada server-side) em vez do mapa interativo — mais barato e suficiente pra esse contexto.
- Botão "Como chegar" → abre Google Maps em nova aba com endereço (handoff externo é OK; nosso mapa não precisa ter routing).
- Linha de informações: "Shuttle gratuito 24h até o terminal · 2 min de trajeto".

### 5.6 Política de cancelamento
Lista em 3-4 linhas com ícone outline:
- ✅ Cancelamento grátis até 24h antes da reserva
- 💸 Após 24h: 80% de reembolso até 4h antes
- ❌ Após 4h: sem reembolso

Texto-base configurável por operadora em `location.reservation_policy`.

### 5.7 Conheça a operadora
Card com:
- Logo da operadora (64×64 round)
- Nome + "Membro da Movepark há N anos"
- Selo "Operador verificado"
- 1 linha de descrição
- Botão "Contatar operadora" (ghost) → abre modal com telefone + e-mail
- Lista horizontal de **outras localizações da operadora** (até 4) — card mini com foto, nome, "Ver vaga"

---

## 6. Reservation card (sticky, direita)

```
┌──────────────────────────────┐
│ R$ 159,50                    │  display-md
│ 5 diárias × R$ 31,90/dia     │  body-sm muted
│                              │
│ ── divider ──                │
│                              │
│ ┌──────────────────────────┐ │
│ │ Check-in                 │ │
│ │ 10 jun · 22:00       [📅]│ │  inline date picker
│ ├──────────────────────────┤ │
│ │ Check-out                │ │
│ │ 15 jun · 08:00       [📅]│ │
│ ├──────────────────────────┤ │
│ │ Passageiros            2 │ │  stepper
│ ├──────────────────────────┤ │
│ │ Veículo            Carro │ │
│ └──────────────────────────┘ │
│                              │
│ ── divider ──                │
│                              │
│ ▼ Detalhes do preço          │
│ Vaga × 5 diárias  R$ 159,50  │  body-sm
│ Capa Protetora    R$  10,00  │  add-ons
│ Cupom (-10%)      -R$ 15,95  │
│ Total            R$ 153,55   │  display-sm bold
│                              │
│ [Reservar agora]             │  primary CTA, full-width, h-48px
│                              │
│ Cancele grátis até 24h antes │  caption muted
│                              │
│ ── divider ──                │
│                              │
│ Cupom de desconto            │
│ [Aplicar cupom →]            │  ghost
└──────────────────────────────┘
```

### Comportamento
- **`position: sticky`** no desktop com top offset = `--nav-height + 16 px`. Fica visível enquanto a coluna esquerda rola.
- Quando o usuário altera datas/passageiros, **re-chama `simulate_price`** (com debounce 300 ms) e atualiza o preço total.
- **Loading state**: skeleton no número grande enquanto recalcula.
- **Old price**: se a regra tem `old_price`, mostra acima do preço atual riscado.

### Validações antes do botão "Reservar agora"
- `from` e `to` preenchidos e válidos.
- `to > from + advance_booking_minutes`.
- `passenger_count > 0` se a localização exige.
- `vehicle` selecionado (se logado, lista veículos do usuário; se anônimo, deixa o checkout pedir).

### Click "Reservar agora"
- Se anônimo OU logado: navega para `/checkout?…params`.
- (Cria booking no banco com `status='pending'` ao entrar no checkout, não aqui — ver `checkout.md`.)

---

## 7. Mobile (< 744 px)

A reservation card **desaparece da lateral** e é substituída por:

### Bottom bar sticky
```
┌─────────────────────────────────────┐
│ R$ 159,50 · 5 diárias  [Reservar →] │
└─────────────────────────────────────┘
```

Altura 72 px, hairline superior, shadow `tier`. Click **expande pra full-screen sheet** com TODOS os campos da reservation card.

---

## 8. Add-ons (serviços extras)

Se a localização tem `location_add_on_service` ativos, eles aparecem dentro da reservation card como toggle list, antes do "Detalhes do preço":

```
Adicionais opcionais
□ Capa Protetora       + R$ 10,00
□ AutoStart            + R$ 15,00
□ Seguro voo            + R$ 25,00
```

Ao marcar/desmarcar, recalcula preço (não chama RPC, soma client-side dos valores cadastrados).

---

## 9. Estados especiais

> ✅ **Implementado** via RPC `check_availability` (hook `useAvailability`, lógica pura
> `listing/availability.logic.ts`). Os estados abaixo — esgotado, estadia mínima, antecedência —
> desabilitam "Reservar agora" e exibem a mensagem; quase-lotação exibe aviso sem bloquear.
> Ver [capacity-rules.md](../capacity-rules.md).

### Datas não escolhidas
Reservation card mostra:
```
A partir de R$ 31,90 / dia

[Escolher datas]  (primary)
```
Sem total. Click → abre date picker overlay.

### Sem disponibilidade pro período
```
Esgotado pro seu período.

[Ver outras datas]  [Próximas vagas]
```

### Política de antecedência violada
```
Reservas pra essa vaga precisam ser feitas com pelo menos 30 minutos
de antecedência. Tente um horário um pouco mais adiante.
```

### Estadia mínima exigida
Se `location_parking_type.has_minimum_stay`:
```
Essa vaga exige reserva mínima de 3 dias.
Sua reserva atual: 2 dias — não disponível.
```

---

## 10. SEO

- `<title>` = "Vaga coberta · Aerovalet Aeroporto de Guarulhos — Movepark"
- Meta description = primeiras 150 chars do "Sobre essa vaga"
- Open Graph image = primeira foto da vaga
- Schema.org `Product` com `Offer` (preço a partir, currency BRL).

---

## 11. Componentes referenciados

| Componente | Uso |
|---|---|
| `{component.rating-display-card}` | Bloco do rating (64px / 900) |
| `{component.amenity-row}` | Lista de comodidades |
| `{component.reviews-card}` | Grid 2-col de reviews |
| `{component.host-card}` | "Conheça a operadora" |
| `{component.reservation-card}` | Sticky right rail |
| `{component.date-picker-day}` | Date inputs no reservation card |
| `{component.button-primary}` | "Reservar agora" |

---

## 12. Open points

- [ ] **Galeria de fotos**: cada `location` precisa de tabela `location_photo (location_id, url, order)`. Falta migration.
- [x] **Reviews**: implementado (PRD-08 — ver [reviews.md](../reviews.md)). `review` + agregado `location.review_avg/count`; o bloco e o selo do topo somem sem avaliações.
- [ ] **Geolocalização da operadora**: já temos `location.lat/lng`. Mas pra mostrar "1,2 km do terminal" precisamos da coord do **terminal**, não da vaga. Catálogo de aeroportos com lat/lng necessário.
- [ ] **Outras localizações da operadora**: query simples `location WHERE company_id = c.id AND id != current.id`. OK.
- [ ] **"Operador verificado"**: precisa de flag `company.is_verified` (boolean). Default true por enquanto, futuro pra moderação.
- [ ] **Política de cancelamento**: hoje `location.reservation_policy` é texto livre. Talvez modelar como estrutura (horas, % reembolso) pra renderizar consistente.
- [ ] **Time-zone display**: reservas pra Portugal (Airpark, Redpark, Skypark) usam `Europe/Lisbon`. Mostrar `22:00 (hora local)` claro.
- [ ] **Add-on display order**: hoje add-ons vêm sem ordem definida. Adicionar `sort_order` em `add_on_service`?
