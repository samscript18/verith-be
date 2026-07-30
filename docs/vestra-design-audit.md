# Vestra Design Audit for Verith

Reference reviewed: `https://vestra-six-self.vercel.app/`

Review date: 2026-07-30

## Translation principle

Vestra is used only as a visual and interaction reference. Verith retains its
own name, copy, information architecture, evidence language, backend
capabilities, and product workflows. Vestra product content, metrics, assets,
and financial business logic are not reused.

## Typography

- Primary typeface: Satoshi, with 300–700 weights.
- Technical labels: JetBrains Mono, primarily 400 and 500.
- Product headings use the same sans-serif family as the interface rather than
  a separate editorial serif.
- Hero headings are compact, medium-to-semibold, tightly tracked, and use a
  roughly 1.05 line height.
- Operational labels are 9–11px mono, uppercase, and widely tracked.

## Palette and surfaces

- Canvas: near-black (`#000000` to `#09090b`).
- Primary foreground: soft white (`#f5f5f5`).
- Surfaces: layered charcoal values around `#0b0c0e`, `#0f1012`, and
  `#16181d`.
- Borders: white at approximately 5–12% opacity.
- Muted text: neutral gray around `#737373` to `#a3a3a3`.
- Focal accent: warm amber, commonly around `#f59e0b`, with a pale amber
  highlight for the primary call to action.
- Semantic colors remain restrained and are reserved for evidence
  relationships, warnings, errors, and processing states.

## Layout

- Fixed 64px header with a translucent black background, subtle bottom border,
  and backdrop blur.
- Main content uses a maximum width near 1400px with 24px horizontal gutters.
- Hero content begins around 160–176px from the top on desktop.
- Hero copy is constrained while the product preview extends wider than the
  text column.
- Major sections use substantial vertical space, thin separators, and
  asymmetric content grids.
- Product surfaces use 12–16px radii, minimal shadow, faint ambient light, and
  compact internal spacing.
- Authenticated screens prioritize a persistent navigation rail, compact
  workspace bar, dense lists, and border-separated inspection regions.

## Components

- Brand lockup combines a compact mark, wordmark, and optional mono product
  descriptor.
- Primary actions use a pale-to-warm amber gradient, pill geometry, a soft
  outer glow, and a small pressed state.
- Secondary actions use translucent dark surfaces with faint white borders.
- Cards use charcoal layers and quiet hover changes rather than large shadows.
- Status treatments are compact, mono, and outlined.
- Empty, loading, and unavailable states remain within the same operational
  visual language.

## Motion

- Initial reveals combine opacity, a 6px blur, and a 14px upward translation.
- Staggered items use short delays and an ease-out curve.
- Most interface transitions run between 200ms and 500ms.
- Large product previews may begin with a restrained perspective rotation and
  flatten on hover over approximately 1000ms using
  `cubic-bezier(0.23, 1, 0.32, 1)`.
- Cards may translate by only a few pixels while borders and surfaces brighten.
- Live processing indicators use a subtle pulse.
- All motion must respect `prefers-reduced-motion`.

## Verith application

- Replace Vestra financial activity with truthful Verith capability labels,
  evidence relationships, workflow states, and clearly identified interface
  previews.
- Never show invented verification IDs, report scores, source counts, usage
  totals, or verdicts as live product data.
- Apply the system across public, authentication, workspace, report, learning,
  and administration surfaces so the product does not split into unrelated
  themes.
- Preserve Verith’s explicit distinctions between evidence, inference,
  uncertainty, unavailable analysis, and limitations.
