# Movepark Design System

A design system for **Movepark**, built by merging the Movepark brand identity (logos, Roboto typography, navy-and-red palette with teal accent) with the structural language of the **Airbnb design system** — pill-shaped global search, photo-first cards, modest display weights, single-shadow elevation, and a generous white canvas.

> _"Mescle a identidade visual existente da Movepark com o Design System do Airbnb. Use as cores, logos e fonte da Movepark."_ — brief.

## Sources

- **Brand identity board** — `uploads/Identidade Visual Movepark.png` _(see also `assets/identidade-visual-movepark.png`)_
- **Wordmark** — `uploads/logo-movepark.svg` _(see `assets/logo-movepark.svg`)_
- **Monogram / symbol** — `uploads/simbolo-movepark.svg` _(see `assets/simbolo-movepark.svg`)_
- **Type system** — Roboto font family, full weight range, uploaded under `fonts/`
- **Structural reference** — Airbnb design system (provided as documentation in the project brief)

No Figma file or production codebase was attached for Movepark. The UI kit screens in `ui_kits/` are therefore high-fidelity recreations of Airbnb-style consumer-marketplace surfaces re-skinned in Movepark brand. **If a real Movepark codebase or Figma exists, please attach it via Import** and we will sync the kit to the real components.

## Brand context

Movepark is a Brazilian mobility brand — the wordmark is set in lowercase Roboto with the **M monogram** rendered as three diagonal stripes (red `#DA455E` over teal `#A6DBDF` over the dark navy `#29263F` mass), evoking parking-line geometry and forward motion. The identity is bilingual-friendly but the source material is in Portuguese (_"Cores Principais", "Escala de Cinza", "Símbolo"_).

The Movepark palette is colder than Airbnb's: where Airbnb leans on warm Rausch as the sole accent, Movepark balances a **deep navy** primary, a **brand red** for headline accents, and a **purple-blue indigo / violet** family used in gradients and secondary surfaces. The teal stripe in the monogram is a quiet third accent — used sparingly inside the brand mark itself.

---

## Index

| File / Folder | Purpose |
|---|---|
| `README.md` | This file — start here |
| `SKILL.md` | Agent-skill manifest (for Claude Code compatibility) |
| `colors_and_type.css` | All foundation tokens: colors, type scale, spacing, radii, elevation, motion |
| `assets/` | Logos (wordmark + monogram) and the identity board PNG |
| `fonts/` | Roboto family — Thin → Black, plus italics |
| `preview/` | Design-system preview cards (registered as DS-tab assets) |
| `ui_kits/website/` | Movepark consumer-marketplace UI kit — Airbnb-shaped, Movepark-skinned |

---

## CONTENT FUNDAMENTALS

### Voice
Movepark's source material is in **Brazilian Portuguese**, formal-friendly — the kind of voice a marketplace uses to address both renters and operators without sounding stiff. Headlines describe the offer ("Encontre uma vaga perto de você"), CTAs are direct verbs ("Reservar", "Buscar", "Continuar"). Sentence case is the default; no shouty all-caps except inside the `NEW` style badges.

Where copy targets a global audience the system falls back to English — also sentence case, also direct. Avoid corporate connectors ("Furthermore", "Additionally"); prefer the short-form Airbnb register ("Hosted by", "4.81", "Reserve").

### Person & address
- **You** for renters (the visitor). _"Find a spot near you."_
- **We** for Movepark itself, sparingly. Mostly the brand speaks through the product, not in the first person.
- **Operators / hosts** are referred to in the third person ("Hosted by Ana", "Operador verificado").

### Casing
- Page titles, section heads, button labels — **sentence case**.
- `NEW` badges and the tiny product-nav recency tags — **ALL CAPS** with 0.4px tracking, weight 900.
- Headlines do not punctuate. Body sentences punctuate normally.

### Numbers, prices, units
- Prices render with the currency symbol prefixed ("R$ 24 / hora", "$18 / night"). The slash-unit form mirrors Airbnb's "per night" idiom.
- Star ratings sit alongside a count: "4.81 · 248 avaliações".
- Distance in kilometers ("0.8 km") and time in concise duration ("2 min de caminhada").

### Emoji & ornaments
**No emoji.** The brand is functional, slightly serious, and leans on the M monogram and laurel-wreath rating ornaments instead. Unicode dots (·) and middle-dots are used freely as separators in meta rows.

### Examples
| Surface | Copy |
|---|---|
| Hero h1 | "Estacione com confiança em qualquer canto da cidade" |
| Hero sub | "Mais de 12 mil vagas verificadas, com reserva instantânea" |
| Card title | "Garagem coberta · Centro" |
| Card meta | "Hosted by Ana · 0.8 km · 24h" |
| Primary CTA | "Reservar agora" / "Reserve" |
| Empty state | "Ainda nada por aqui. Que tal salvar sua primeira vaga?" |

---

## VISUAL FOUNDATIONS

### Colors
Movepark's five **Cores Principais** plus the five-step **Escala de Cinza** map onto Airbnb-style semantic slots:

| Movepark token | Hex | Role |
|---|---|---|
| `--mp-navy` | `#29263F` | Primary ink, headlines, top-nav logo, footer ground |
| `--mp-indigo` | `#4041A3` | Secondary brand accent — gradient base, link-blue substitute |
| `--mp-violet` | `#5D5FEF` | Gradient terminus, marketing surfaces, focus glow |
| `--mp-pale` | `#E4F2FF` | Tinted soft surface — empty states, hover backgrounds |
| `--mp-red` | `#DA455E` | The Movepark "Rausch" — primary CTAs, search orb, save state |
| `--mp-red-deep` | `#AE374B` | Press state for red CTAs |
| `--mp-teal` | `#A6DBDF` | Tertiary accent — only inside the M monogram and rare brand moments |

The grayscale scale (`#FFFFFF → #E0E0E0 → #E0E5F2 → #818FAF → #424242`) replaces Airbnb's neutral ramp; the steel-blue `#818FAF` is the Movepark twist on a "muted" tone — used for borders on disabled controls and the secondary muted body color.

The **brand gradient** (`#4041A3 → #5D5FEF → #4041A3`) is documented in the identity board and reserved for hero scrim treatments and the empty-state illustration band. **Do not use the gradient for buttons or cards** — keep it editorial.

### Typography
**Roboto** for everything. Display headlines run at modest weights (500–700), matching Airbnb's "type quiet, photo loud" philosophy. The one loud typographic moment is the **rating display** at 64px / 900 — the only place type alone carries hierarchy.

The full type scale lives in `colors_and_type.css` as CSS variables (`--type-display-xl-*`, `--type-body-md-*`, etc.). See the `preview/type-*` cards in the DS tab for live specimens.

### Spacing & layout
- **Base unit:** 4px (with 2px micro-step).
- **Section padding:** 64px vertical for major editorial bands.
- **Card grids:** 16px gutters (dense marketplace rhythm).
- **Content max-width:** 1280px editorial / 1080px listing-detail.

### Backgrounds & imagery
- **No textures, no repeating patterns, no hand-drawn illustrations** in the brand surface — the canvas is pure white.
- **Photography** is expected to be warm-cool neutral: realistic urban photography (garages, streetscapes, vehicles). No filters, no grain, no duotone.
- A single **brand-gradient band** (`--mp-gradient-brand`) is used for the empty-state hero and the "Become a host / Seja um operador" sub-CTA strip — and nowhere else.
- The M monogram appears as a brand mark only — never as a watermark or repeating decoration.

### Borders & corners
Airbnb's soft shape language carries over: **8px** for buttons (`--radius-sm`), **14px** for cards (`--radius-md`), **20px** for larger surfaces, **32px** for category strips, and **fully rounded** (`9999px`) for the global search pill, the search orb, the heart save, and the `NEW` badges. Hard corners only on the body grid itself.

### Elevation
**One shadow tier** —
```
rgba(41, 38, 63, 0.04) 0 0 0 1px,
rgba(41, 38, 63, 0.06) 0 2px 6px 0,
rgba(41, 38, 63, 0.10) 0 4px 12px 0
```
Tinted toward navy rather than pure black, so cards float without warming the page. Applied to: property cards on hover, the resting search bar, dropdown menus (account, language, date picker), the sticky reservation card. **Nothing else.** No progressive elevation tiers, no inner shadows, no glow.

### Hover & press
- **Hover (cards):** subtle elevation lift via `--shadow-card` plus a 1px navy hairline darkening. No scale, no color change.
- **Hover (buttons):** primary fills darken to `--colors-primary-active` (`#C32B45`). Secondary outlined buttons fill `--colors-surface-soft`.
- **Hover (text links):** color flips to `--colors-error` (`#C13515`) and the underline persists.
- **Press:** instant background swap to the `-active` variant; no transform, no shadow change (Airbnb-style: depth comes from photo, not from motion).
- **Focus:** 2px navy ring (`--shadow-focus-ring`). On form inputs, the border thickens to 2px and flips to navy — no glow.

### Transparency & blur
- **Scrim only.** The modal/scrim backdrop is `rgba(41, 38, 63, 0.55)` — a navy-tinted scrim, never pure black.
- No frosted glass, no `backdrop-filter` blurs anywhere on the public surface. The clean white canvas is the brand.

### Motion
- Quiet, Airbnb-quiet. Fades and crossfades only — **no bounces, no springs**.
- `--duration-fast` (120ms) for hover state swaps, `--duration-base` (200ms) for menu opens, `--duration-slow` (320ms) for modal mount.
- Easing is `cubic-bezier(0.2, 0, 0, 1)` (`--easing-standard`) — even deceleration.

### Cards
A Movepark card is:
- White surface on the white canvas.
- `--radius-md` (14px) corner clipping.
- Optional 1px `--colors-hairline` border at rest (mostly only on the sticky reservation card).
- Photo-first: the image plate sits flush at the top with rounded corners; meta block sits beneath with 16px internal padding.
- On hover: applies `--shadow-card`.
- Heart save top-right; floating "Guest favorite" pill top-left in the `--type-badge` style.

### Layout rules / fixed elements
- **Top nav** is sticky / fixed at 80px (`--nav-height`) with a 1px bottom hairline and no shadow.
- **Reservation card** on listing-detail pages is `position: sticky` to the right rail above 1128px; below 744px it collapses to a fixed bottom bar.
- **Modal scrim** is fixed full-viewport at z-index above all sticky elements.

---

## ICONOGRAPHY

Movepark's identity board doesn't ship its own icon set, so the Airbnb-shaped UI surfaces in this system substitute **Lucide icons** (`https://unpkg.com/lucide-static@latest`) — chosen because the stroke weight (1.5–2px) and rounded line caps match the calm, geometric feel of the Movepark wordmark. **This is a substitution** — flag for the user; if Movepark has its own production icon set we should swap it in.

### Rules
- Stroke icons only. **No filled solid icons** except for the heart save state when active and the star inside rating displays.
- **24px** is the default icon size in body and toolbar contexts; **20px** inside inline meta rows; **16px** inside dense table cells; **32px** for the hand-illustrated three-product top-nav tabs.
- **Stroke color** matches the surrounding text color — `var(--colors-ink)` for active, `var(--colors-muted)` for inactive.
- **No emoji** in product surfaces. Unicode middle-dots (`·`) and bullets are used freely as inline separators inside meta rows.
- **Logos:** the wordmark (`assets/logo-movepark.svg`) is used at navigation and footer scale; the monogram (`assets/simbolo-movepark.svg`) is used as a favicon, app icon, and inside hero ornaments.

### Brand mark usage
- The wordmark has a minimum height of 24px; below that, use the monogram alone.
- Clear-space margin around the wordmark equals the height of the "m" stem in the lowercase wordmark.
- Never recolor the M monogram. Never separate the three stripes. Never put it on a colored background that fights the red.

---

## What's missing / known gaps

- **Movepark codebase / Figma** — not provided. UI kits are inferred from the merged brand + Airbnb structural spec. Attach the real Figma or repo to upgrade fidelity.
- **Photography library** — no real Movepark imagery was provided; placeholder Unsplash photography is used in the UI kit.
- **Icon set** — substituted with Lucide (flagged).
- **Sub-brand systems** (e.g. Movepark for operators / fleet) — not in the source material.
- **Loading / skeleton states** — not yet documented.
- **Map view styling** — not captured.

Open this project's **Design System** tab to browse the foundation cards. Open `ui_kits/website/index.html` to see the website kit in action.
