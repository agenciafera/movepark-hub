# Home pública + Barra de busca

> A home é a porta de entrada. Não há login obrigatório.
> A busca é o coração da experiência — tudo gira em torno dela.

---

## 1. Objetivo da página `/`

Em **3 segundos**, o usuário deve entender:
1. Que ele pode reservar vagas de estacionamento em aeroportos brasileiros e portugueses.
2. Que ele começa indicando **para onde** e **quando** ele vai.
3. Que a marca é confiável (operadoras parceiras, número de vagas, avaliações).

Em **15 segundos**, ele deve conseguir iniciar uma busca útil.

---

## 2. Estrutura vertical (desktop)

```
┌──────────────────────────────────────────────────────────────┐
│ [Topbar] [Wordmark]              [PT-BR][Seja parceiro][▾]   │   80 px
├──────────────────────────────────────────────────────────────┤
│                                                              │
│           "Estacione com confiança em                        │
│            qualquer aeroporto"                               │
│                                                              │
│            ┌──────────────────────────────────┐              │  Hero
│            │ [Where][When][Hour][Vehicle][🔎] │              │  ~480 px
│            └──────────────────────────────────┘              │
│                                                              │
│      [Aeroporto de Guarulhos] [Congonhas] [Viracopos] →      │  Quick
│                                                              │  chips
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Categorias                                                 │
│   ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                    │  Cat strip
│   │Cob. │ │Desc.│ │Valet│ │Prem.│ │Moto │                    │
│   └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Aeroportos populares no Brasil                             │
│   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                        │  Cities
│   │ GRU  │ │ CGH  │ │ VCP  │ │ AFL  │  → ver todos           │  grid
│   └──────┘ └──────┘ └──────┘ └──────┘                        │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Por que reservar com a Movepark?                           │
│   ▢ Cancelamento grátis  ▢ Operadoras verificadas            │  Trust
│   ▢ Preço travado        ▢ Atendimento 24h                   │  band
│                                                              │
├──────────────────────────────────────────────────────────────┤
│   Como funciona — 3 passos com ilustração leve               │
├──────────────────────────────────────────────────────────────┤
│   Seja um operador parceiro [LP B2B] → /seja-parceiro        │
├──────────────────────────────────────────────────────────────┤
│   [Footer]                                                   │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Hero

### Conteúdo
- **h1** em `display-xl` (28 px / 700) — sentence case, 2 linhas no desktop, 3 no mobile.
- **subtítulo** em `body-md` muted, 1 linha.
- **Barra de busca** centralizada.
- **Chips de aeroportos populares** logo abaixo da busca.

### Fundo
- **Foto** de aeroporto/estrada/garagem (ainda placeholder). Aspect 21:9 no desktop, 4:5 no mobile.
- Sobre a foto, scrim navy `rgba(41,38,63,0.55)` — não pode atrapalhar contraste.
- Texto **branco** sobre o scrim.

### Variação
Quando o usuário rolar pra baixo, o hero **vira**. A barra de busca **sobe pro topbar** e fica fixa (sticky). Transição com fade + slide-up de 200 ms.

---

## 4. A barra de busca (componente central)

### Estado expandido (desktop, na home)

Pill rounded-full `--radius-full`, h-72px, border `1px hairline`, shadow tier. Dividida em **4 segmentos** por hairline vertical.

```
┌─────────────────────────────────────────────────────────────┐
│ Onde?       │ Check-in    │ Check-out   │ Veículo  │ [🔎]   │
│ Aeroporto…  │ 10 jun · 22h│ 15 jun · 08h│ Carro    │        │
└─────────────────────────────────────────────────────────────┘
```

| Segmento | Tipo | Comportamento |
|---|---|---|
| **Onde?** | Combobox autocomplete | Sugere airports (códigos IATA + nome), cidades. Geolocation "Perto de mim". |
| **Check-in** | Date+time picker | Calendar inline + step de 30 min. |
| **Check-out** | Date+time picker | Mesma coisa, validado > check-in. |
| **Veículo** | Select | Carro, Moto. (Opcional — afeta filtros) |
| **🔎** | Botão circular vermelho | `bg-mp-primary`, 48×48, ícone branco. |

Clicar em qualquer segmento → expande aquele drawer/popover. Resto da pill fica visível mas inativo.

### Estado colapsado (sticky no topbar após scroll, OU em mobile)

Pill com **placeholder único**: "Onde · Quando · Veículo" + ícone 🔎. Click → abre overlay full-screen no mobile / dropdown no desktop com os 4 segmentos.

### Validações ao submeter
- Onde: obrigatório, mínimo 2 chars + um item da lista de sugestões.
- Check-in: obrigatório, >= **agora + 30 min** (varia conforme `pricing_rule.advance_booking_minutes` da localização escolhida, mas validamos um mínimo global aqui).
- Check-out: obrigatório, > check-in.
- Veículo: padrão "Carro".

### Submissão
`navigate("/search?dest=GRU&from=2026-06-10T22:00:00Z&to=2026-06-15T08:00:00Z&vehicle=car")`

Persistimos os params no `URLSearchParams` pra deep link.

---

## 5. Category strip

Lista horizontal scrollável (sem barra), inspirada em Airbnb.

```
🚗 Coberta   🌧 Descoberta   🅿 Valet   ⭐ Premium   🏍 Moto   🚚 Box
```

Cada categoria é um botão pill (`rounded-full`, `caption`, `bg-surface-soft` quando inativo, `bg-mp-navy text-white` quando ativo). Clicar → adiciona/remove o filtro de `parking_type.code` na URL e abre `/search` se ainda não estiver lá.

Ícones substituíveis por Lucide (Car, CloudRain, KeyRound, Star, Bike, Container).

---

## 6. Aeroportos populares

Grid 4 colunas (desktop), 2 (tablet), 1 (mobile). Cada cartão:

```
┌─────────────────────┐
│ [foto do aeroporto] │
│                     │
│ Guarulhos (GRU)     │  title-md ink
│ São Paulo · 4 vagas │  body-sm muted
└─────────────────────┘
```

- `rounded-md`, `shadow-tier` no hover.
- Click → `/search?dest=GRU` (sem datas — usuário escolhe na próxima tela).

Lista de aeroportos pode ser hardcoded inicialmente (8-10 principais BR + PT). Futuro: derivar do banco via popularidade.

---

## 7. Trust band

Faixa horizontal com 4 selos. Sem ilustrações pesadas, só ícone outline + label + 1 linha de copy.

```
🛡  Cancelamento grátis até X horas antes
🏷  Preço travado, sem surpresas no balcão
✅  Operadoras verificadas pela Movepark
📞  Atendimento 24h por dia, 7 dias por semana
```

Cor: ícone em `mp-indigo`, labels em `ink`, copy em `muted`. Background `bg-surface-soft`.

---

## 8. "Como funciona"

3 passos numerados (1 · 2 · 3) com mini-ilustração (ou ícone Lucide grande):

1. **Buscar** — Digite o aeroporto e suas datas.
2. **Comparar** — Veja opções de várias operadoras num só lugar.
3. **Reservar** — Pague online e receba seu voucher por e-mail.

Layout 3-col desktop, vertical mobile.

---

## 9. Block "Seja parceiro"

CTA estrito pra operadores. Banda full-bleed com **gradiente da marca** (`--mp-gradient-brand` — único lugar permitido), texto branco, botão `secondary` branco com texto navy.

```
┌──────────────────────────────────────────────────────┐
│ Tem um estacionamento? Liste com a Movepark.         │
│ Aumente sua ocupação com nossa rede de viajantes.    │
│                                       [Saiba mais →] │
└──────────────────────────────────────────────────────┘
```

---

## 10. Estados específicos

### Home com usuário logado
- Adiciona linha "Bem-vindo(a) de volta, {nome}" acima do h1 em `display-sm`.
- Mostra um carousel de "Suas buscas recentes" entre a busca e as categorias (vem do localStorage + últimas 5 reservas).
- Se há uma reserva **em uso hoje**: banner sticky no topo com link rápido pro voucher.

### Mobile (< 744px)
- Hero usa foto 4:5.
- Barra de busca **colapsa** em uma única pill com placeholder "Onde você vai estacionar?". Click → full-screen sheet com os 4 campos empilhados.
- Category strip vira scroll horizontal natural com snap.
- Cities grid 1 coluna.

---

## 11. Componentes referenciados

| Token | Origem | Uso aqui |
|---|---|---|
| `{component.search-bar-pill}` | design-tokens | Barra de busca principal |
| `{component.search-orb}` | design-tokens | Botão circular vermelho 🔎 |
| `{component.property-card}` | design-tokens | Não usado aqui (vai pra `/search`) |
| `{type.display-xl}` | design-tokens | h1 do hero |
| `{type.body-md}` | design-tokens | Subtítulo |
| `{rounded.full}` | design-tokens | Pill, orb |
| `{rounded.xl}` | design-tokens | Category strip pills (32 px) |

---

## 12. Conteúdo dinâmico vs estático

| Bloco | Origem |
|---|---|
| Hero h1 + sub | Estático (i18n) |
| Foto de fundo | Estática (asset bundled) |
| Aeroportos populares | Inicialmente estático; futuro: derivar de `location` com mais bookings |
| Categorias | Lista do banco (`parking_type` catálogo) |
| Trust band | Estático |
| "Como funciona" | Estático |
| Banner "Seja parceiro" | Estático com link pra LP |

---

## 13. Open points

- [ ] Geolocation "Perto de mim" exige permissão de browser — precisamos de UX pra "Use sua localização" + fallback se negar.
- [ ] Autocomplete de aeroportos: lista global hardcoded (~30 cidades/aeroportos) OU vier do banco? Hardcoded mais simples no MVP.
- [ ] Foto de fundo do hero: usar foto da operadora mais popular daquela busca recente? Ou foto genérica do brand? **Decisão**: genérica no MVP.
- [ ] Quando a Movepark adicionar Europa em escala, a home precisa mudar idioma + currency. Hoje: PT-BR + BRL.
