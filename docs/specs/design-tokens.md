# Design Tokens — Movepark Hub

> Adaptação do Airbnb design system para a brand Movepark.  
> **TODO:** substituir os valores `{PENDING}` quando a paleta oficial Movepark for definida.

---

## Colors

### Brand & Accent

| Token | Valor Provisório | Airbnb Equiv. | Uso |
|---|---|---|---|
| `{colors.mp-primary}` | `{PENDING}` | `{colors.primary}` #ff385c | CTAs principais, elementos de destaque |
| `{colors.mp-primary-active}` | `{PENDING}` | `{colors.primary-active}` #e00b41 | Estado pressed do CTA |
| `{colors.mp-primary-disabled}` | `{PENDING}` | `{colors.primary-disabled}` #ffd1da | CTA desabilitado |

> Até a paleta ser definida, usar `#0057ff` (azul neutro) como placeholder para visualização.

### Surface (mantidos do Airbnb)

| Token | Valor | Uso |
|---|---|---|
| `{colors.canvas}` | #ffffff | Fundo padrão de todas as páginas |
| `{colors.surface-soft}` | #f7f7f7 | Sidebar, rows pares de tabela, campos desabilitados |
| `{colors.surface-strong}` | #f2f2f2 | Botões circulares de ação secundária |

### Hairlines & Borders (mantidos)

| Token | Valor | Uso |
|---|---|---|
| `{colors.hairline}` | #dddddd | Bordas de cards, separadores de tabela |
| `{colors.hairline-soft}` | #ebebeb | Separadores secundários |
| `{colors.border-strong}` | #c1c1c1 | Input outline em foco |

### Text (mantidos)

| Token | Valor | Uso |
|---|---|---|
| `{colors.ink}` | #222222 | Títulos, body principal, nav links |
| `{colors.body}` | #3f3f3f | Texto corrido em descrições longas |
| `{colors.muted}` | #6a6a6a | Labels secundários, placeholders |
| `{colors.muted-soft}` | #929292 | Texto desabilitado |
| `{colors.on-primary}` | #ffffff | Texto sobre CTAs coloridos |

### Semantic

| Token | Valor | Uso |
|---|---|---|
| `{colors.success}` | #008a05 | Badge "confirmed", "active", toast de sucesso |
| `{colors.warning}` | #e67e00 | Badge "pending" |
| `{colors.error}` | #c13515 | Badge "cancelled", validação, toast de erro |
| `{colors.info}` | #0057ff | Informações neutras |

### Status Badges

| Status | Cor de fundo | Cor do texto |
|---|---|---|
| `confirmed` | #e6f4ea | #008a05 |
| `active` | #e3f0ff | #0057ff |
| `pending` | #fff3e0 | #e67e00 |
| `completed` | #f7f7f7 | #6a6a6a |
| `cancelled` | #fdecea | #c13515 |

---

## Typography

> Usar **Inter** enquanto fonte Movepark não estiver disponível.  
> Ajustar line-height display em -2% em relação ao Airbnb Cereal ao usar Inter.

| Token | Size | Weight | Line Height | Uso |
|---|---|---|---|---|
| `{typography.display-xl}` | 28px | 700 | 1.43 | KPI numbers grandes |
| `{typography.display-lg}` | 22px | 500 | 1.18 | Títulos de página |
| `{typography.display-md}` | 21px | 700 | 1.43 | Títulos de seção |
| `{typography.display-sm}` | 20px | 600 | 1.20 | Sub-títulos |
| `{typography.title-md}` | 16px | 600 | 1.25 | Cabeçalhos de card, colunas de tabela |
| `{typography.body-md}` | 16px | 400 | 1.50 | Texto corrido |
| `{typography.body-sm}` | 14px | 400 | 1.43 | Meta de tabelas, datas, valores secundários |
| `{typography.caption}` | 14px | 500 | 1.29 | Labels de campos, badges |
| `{typography.caption-sm}` | 13px | 400 | 1.23 | Footer, copyright |
| `{typography.button-md}` | 16px | 500 | 1.25 | Labels de botões primários |
| `{typography.button-sm}` | 14px | 500 | 1.29 | Labels de botões secundários/pill |

---

## Spacing

> Mantido do Airbnb — base 4px.

| Token | Valor |
|---|---|
| `{spacing.xxs}` | 2px |
| `{spacing.xs}` | 4px |
| `{spacing.sm}` | 8px |
| `{spacing.md}` | 12px |
| `{spacing.base}` | 16px |
| `{spacing.lg}` | 24px |
| `{spacing.xl}` | 32px |
| `{spacing.xxl}` | 48px |
| `{spacing.section}` | 64px |

---

## Border Radius

| Token | Valor | Uso |
|---|---|---|
| `{rounded.sm}` | 8px | Botões, inputs, tooltips |
| `{rounded.md}` | 14px | Cards, modais, drawers |
| `{rounded.xl}` | 32px | Pill buttons |
| `{rounded.full}` | 9999px | Avatares, badges circulares, search bar |

---

## Elevation

> Mesmo sistema do Airbnb — uma única tier de sombra.

```css
/* Card hover / dropdown / modais */
box-shadow:
  rgba(0, 0, 0, 0.02) 0 0 0 1px,
  rgba(0, 0, 0, 0.04) 0 2px 6px 0,
  rgba(0, 0, 0, 0.10) 0 4px 8px 0;

/* Scrim de modal */
background: rgba(0, 0, 0, 0.50);
```

---

## Grid & Layout

| Contexto | Desktop | Tablet | Mobile |
|---|---|---|---|
| Manager/Operator — conteúdo | max-width 1280px | 100% | 100% |
| Sidebar | 240px (fixed) | 64px (ícones) | bottom nav |
| KPI Cards | 4 colunas | 2 colunas | 1 coluna |
| Tabelas | full width | scroll horizontal | cards empilhados |
| Drawer de detalhe | 480px | 60vw | full screen |

---

## Componentes Base

### Botões

```
button-primary:   mp-primary fill · white text · rounded.sm · h-12 · px-6 · weight 500
button-secondary: white fill · ink text · 1px ink border · rounded.sm · h-12
button-ghost:     transparent · ink text · no border · underline on hover
button-danger:    error fill · white text · rounded.sm · h-12
button-pill:      mp-primary fill · rounded.full · h-9 · px-4 · 14px
```

### Badge de Status

```
Pill pequeno · rounded.full · h-6 · px-3 · caption weight 500
Cores conforme tabela Status Badges acima
```

### Input

```
white fill · hairline border · rounded.sm · h-14 · px-3
label acima em caption muted
focus: border 2px ink
error: border error + helper text em colors.error abaixo
```

### Card Base

```
white fill · rounded.md · hairline border · shadow tier · padding lg (24px)
```

---

## Open Points

- [ ] Definir paleta oficial Movepark (primary, eventual secondary)
- [ ] Confirmar fonte oficial (custom ou Inter como definitiva)
- [ ] Logo em SVG nas variações: full color, white, icon-only
- [ ] Dark mode: fora do escopo por ora
