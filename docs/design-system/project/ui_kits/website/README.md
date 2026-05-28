# Movepark Website UI Kit

A Movepark-skinned recreation of an Airbnb-shaped consumer marketplace — pill-shaped global search, photo-first property cards, category strip, sticky reservation rail, and the system's one loud type moment (the rating display) — all powered by the Movepark identity (navy + indigo + red, Roboto, the M monogram).

## What's modeled

This kit demonstrates a parking-spot marketplace inspired by Airbnb's information architecture. Spots replace homes; nightly rates become hourly rates; "Superhost" becomes "Operador verificado".

## Files

| File | Purpose |
|---|---|
| `index.html` | Live clickable prototype — wires all components together |
| `styles.css` | Imports project foundations and adds component-level styles |
| `TopNav.jsx` | Global navigation with three product tabs |
| `SearchBar.jsx` | Pill-shaped search with Onde / Quando / Duração segments + red orb |
| `CategoryStrip.jsx` | Horizontal scrollable category filter (Cobertas, 24h, etc.) |
| `PropertyCard.jsx` | Photo-first card with carousel dots, fav badge, heart save, meta |
| `ListingDetail.jsx` | 2-column detail page: gallery, amenities, rating-display, sticky reservation rail |
| `Footer.jsx` | Three-column light footer + legal band |

## Flows

The prototype starts on the home page. From there you can:
- Tap a property card → opens the listing detail page
- Tap the heart on any card → toggles save state (Rausch/red fill)
- Tap the account button (top-right) → opens the login modal
- Tap "Reservar" on the detail page → confirms with a toast and returns home

## Caveats

- **No real photography** — every image plate is a brand-aligned gradient placeholder. Plug in production photography once available.
- **No real Movepark codebase** was provided; component shapes are inferred from the merged brand + Airbnb structural reference. Attach the real Figma or repo to upgrade fidelity.
- **Icons** are hand-rolled SVGs in the Lucide stroke style (~1.7–2px strokes, rounded line caps). Swap in Movepark's production icon set when available.
- **i18n**: copy is in Brazilian Portuguese to match the source brand. The system can fall back to English using the same casing rules.
