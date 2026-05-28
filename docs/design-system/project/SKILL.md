---
name: movepark-design
description: Use this skill to generate well-branded interfaces and assets for Movepark, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick orientation

Movepark is a consumer-marketplace brand whose visual system is built by merging the Movepark identity (navy `#29263F`, indigo `#4041A3`, violet `#5D5FEF`, pale `#E4F2FF`, red `#DA455E`, with a teal `#A6DBDF` accent and a steel-blue gray scale) onto the structural language of the Airbnb design system — pill-shaped global search, photo-first cards, modest display weights in Roboto, single-shadow elevation, and a generous white canvas.

- **Foundations:** `colors_and_type.css` — all tokens as CSS variables.
- **Brand assets:** `assets/logo-movepark.svg`, `assets/simbolo-movepark.svg`, `assets/identidade-visual-movepark.png`.
- **Fonts:** Roboto (Thin → Black + italics) in `fonts/`.
- **UI kit:** `ui_kits/website/` — Movepark consumer website prototype (JSX + index.html). Read the kit's `README.md` for component list and flows.
- **Preview cards:** `preview/` — the small DS-tab specimens for color, type, spacing, components.

## Brand rules in one minute

- One accent: Movepark **red** `#DA455E` for the primary CTA, the search orb, and the saved-heart fill. Used scarcely.
- Headlines and ink are **navy** `#29263F`, never pure black.
- Type is **Roboto** at modest weights (500–700 for display, 400 for body). The only loud type moment is the rating display at 64px / 900.
- Shape language is **soft**: 8px buttons, 14px cards, 32px category pills, fully rounded search bar / orb / heart / NEW badges.
- One shadow tier, tinted toward navy. Flat everywhere else.
- The brand **gradient** (`#4041A3 → #5D5FEF → #4041A3`) is editorial only — never on CTAs.
- No emoji. No textures. No hand-drawn illustrations. White canvas, photography-led.
- Voice is Brazilian Portuguese, sentence case, direct verbs. "Reservar agora", not "Reserve Now!".
