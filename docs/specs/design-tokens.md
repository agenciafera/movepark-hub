# Design Tokens — Movepark Hub

> Identidade visual Movepark: whitespace generoso, hierarquia tipográfica clara em Inter,
> paleta violet/indigo/navy e uma única tier de sombra tingida em navy. Benchmark completo em
> [`docs/design-system/visual-benchmark.md`](../design-system/visual-benchmark.md).

---

## Colors

### Brand & Accent

| Token | Valor | Uso |
|---|---|---|
| `{colors.mp-primary}` | `#5D5FEF` | CTAs principais, elementos de destaque |
| `{colors.mp-primary-active}` | `#4041A3` | Estado hover/pressed do CTA |
| `{colors.mp-primary-disabled}` | `#C5C4F6` | CTA desabilitado |
| `{colors.mp-navy}` | `#29263F` | Headings principais, sidebar, logotipo dark |

### Surface

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

> **Inter é a fonte definitiva.** Sem custo de licença, legível em interfaces densas, pesos 100–900 disponíveis via Google Fonts (variable font `ital,opsz,wght`). Carregada em `index.html` com `display=swap`.
>
> Pesos em uso: 400 (corpo), 500 (medium — subtítulo, botão, nav), 600 (semibold — título de card, display-sm), 700 (bold — headings, display), 900 (black — rating, tag).

### Display

| Token | Size | Weight | Line Height | Letter Spacing | Uso |
|---|---|---|---|---|---|
| `display-3xl` | 56px | 700 | 1.08 | -0.8px | Hero H1 desktop, CtaBanner desktop |
| `display-2xl` | 44px | 700 | 1.10 | -0.5px | Hero H1 mobile, section H2 desktop |
| `display-xl` | 28px | 700 | 1.32 | -0.2px | KPI numbers, destaques numéricos |
| `display-lg` | 22px | 500 | 1.20 | -0.3px | Títulos de página |
| `display-md` | 21px | 700 | 1.40 | — | Títulos de seção |
| `display-sm` | 20px | 600 | 1.22 | -0.15px | Sub-títulos |

### Corpo

| Token | Size | Weight | Line Height | Uso |
|---|---|---|---|---|
| `title-md` | 16px | 600 | 1.25 | Cabeçalhos de card, colunas de tabela |
| `title-sm` | 16px | 500 | 1.25 | Subtítulo, nav section headers |
| `body-md` | 16px | 400 | 1.50 | Texto corrido |
| `body-sm` | 14px | 400 | 1.43 | Meta de tabelas, datas, valores secundários |
| `caption` | 14px | 500 | 1.29 | Labels de campos, rótulos de formulário |
| `caption-sm` | 13px | 400 | 1.23 | Footer, copyright, timestamps |

### Utilitárias

| Token | Size | Weight | Line Height | Letter Spacing | Uso |
|---|---|---|---|---|---|
| `rating-display` | 64px | 900 | 1.05 | -1.5px | Único momento "alto" — detalhe de vaga |
| `badge` | 11px | 700 | 1.18 | 0.1px | Chips de destaque, badges de status |
| `micro-label` | 12px | 700 | 1.33 | — | Labels uppercase pequenas (Chegada, Saída) |
| `uppercase-tag` | 8px | 900 | 1.25 | 0.4px | Tags NEW, NOVO uppercase |
| `button-md` | 16px | 500 | 1.25 | — | Labels de botões primários |
| `button-sm` | 14px | 500 | 1.29 | — | Labels de botões secundários/pill |
| `link` | 14px | 400 | 1.43 | — | Links inline em texto corrido |
| `nav-link` | 16px | 600 | 1.25 | — | Links de navegação principal |

---

## Spacing

> Base 4px.

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

> Uma única tier de sombra, tingida em navy (#29263F).

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

- [x] Paleta oficial Movepark definida — violet `#5D5FEF` / indigo `#4041A3` / navy `#29263F`
- [x] Fonte oficial: Inter (definitiva)
- [ ] Logo em SVG nas variações: full color, white, icon-only
- [ ] Dark mode: fora do escopo por ora
