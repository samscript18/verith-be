# Vectra Design Audit and Verith Translation

## Scope

This audit covers the frontend in `samscript18/Vectra` at the `main` branch and
maps its visual system onto Verith without changing Verith routes, data access,
authentication, forms, state management, or backend workflows.

Vectra is a design reference, not a content or product reference. Verith retains
its own brand, evidence language, investigation model, and accessibility
requirements.

## Visual foundation

| Token | Vectra reference | Verith use |
| --- | --- | --- |
| Canvas | `#08090A` | Global page background |
| Panel | `#0B0C0E` | Sidebar and quiet page regions |
| Surface | `#0F1012` | Navigation and elevated controls |
| Card | `#070708` | Primary content cards |
| Foreground | `#F8FAF7` | High-emphasis text |
| Border | `rgba(255,255,255,0.06)` | Default card and region border |
| Strong border | `rgba(255,255,255,0.10)` | Hover and active separation |
| Violet | `#8B5CF6` | Verith evidence accent |
| Violet light | `#C084FC` | Primary gradient start |
| Indigo | `#6366F1` | Primary gradient end |
| Cyan | `#06B6D4` | Information and evidence retrieval |
| Emerald | `#10B981` | Supported and healthy states |
| Amber | `#F59E0B` | Uncertainty and caution |
| Red | `#EF4444` | Failure and destructive actions |

The interface uses very low-contrast surfaces, thin translucent borders, and
ambient colored light instead of bright blocks or heavy shadows. Primary cards
use a 24px radius and a deep, diffuse shadow. Nested records use 12–16px radii
and one-to-four-percent white fills.

## Typography

Plus Jakarta Sans is the primary product font. It is used for navigation,
headings, body copy, forms, report explanations, and actions.

JetBrains Mono is limited to data that is genuinely technical, such as
investigation identifiers, timestamps, evidence metadata, confidence values,
and admin diagnostics. It is not used for ordinary navigation or explanatory
copy so Verith does not inherit a terminal-like voice.

Key sizing:

- Public hero: 48px on small screens and 72px on large screens.
- Application page title: 36px on small screens and 48px on large screens.
- Section title: 28–48px depending on hierarchy.
- Body: 14–16px with 1.6–1.75 line height.
- Metadata and status labels: 10–12px with restrained uppercase tracking.

## Layout system

### Public experience

- Full-width, translucent header with a thin bottom border.
- Left-aligned hero with a controlled line length.
- Maximum section width of 1300px and header width of 1400px.
- Large product preview with perspective and depth on the landing page.
- Rounded feature surfaces instead of ruled editorial rows.
- Alternating canvas and panel regions for pacing.
- Mobile layouts stack naturally and preserve 24px side gutters.

### Authenticated experience

- Desktop grid with a 292px navigation column.
- Fixed sidebar inset 16px from the viewport and 260px wide.
- Sidebar uses a 24px radius, subtle border, backdrop blur, and deep shadow.
- Main content uses a maximum width of 1280px with 20px mobile and 32px desktop
  padding.
- Mobile uses a compact sticky header and fixed bottom navigation.
- Investigation, report, learning, account, and admin pages share the same page
  heading, card, nested record, input, and action recipes.

### Responsive patterns

- `md` introduces multi-column cards and horizontal form actions.
- `lg` enables the desktop shell and primary two-column workspaces.
- Fixed navigation is replaced, not duplicated, on small screens.
- Buttons remain at least 44px tall.
- Long identifiers and source URLs wrap safely.
- Dialogs remain viewport-bounded and scroll internally.

## Component recipes

### Primary card

```text
24px radius
1px white border at 6% opacity
#070708 at 60–80% opacity
20–32px padding
deep diffuse black shadow
border increases to 15% opacity on hover
```

### Nested record

```text
12–16px radius
1px white border at 3–5% opacity
white fill at 1–3% opacity
12–16px padding
```

### Primary action

```text
full pill radius
gradient from #C084FC to #6366F1
44px minimum height
1.02 hover scale
0.98 pressed scale
```

### Secondary action

```text
full pill radius
white border at 10% opacity
white fill at 4% opacity
slightly brighter hover surface
```

### Input

```text
16px radius
44px minimum height
white border at 5% opacity
white fill at 3% opacity
violet focus border and soft focus halo
```

## Motion system

Motion follows Vectra’s layered approach while retaining Verith’s reduced-motion
support:

- Route entrance: opacity and 10px vertical translation over 400ms.
- Content reveal: opacity and 8–12px vertical translation.
- Related cards: 30–50ms stagger.
- Card hover: up to 3px lift.
- Buttons: 1.02 hover scale and 0.98 pressed scale.
- Drawers and dialogs: short opacity and translation transitions.
- Accordions: height and opacity over roughly 220ms.
- Landing backdrop: five slowly moving ambient orbs, a rotating conic sweep,
  a horizontal light streak, and a subtle dot field.
- Landing product preview: perspective tilt that flattens on hover.

All decorative motion is disabled or reduced when the operating system requests
reduced motion.

## Verith-specific translation rules

The rebuild adopts Vectra’s palette, typography, spacing, shell, card language,
button system, fields, ambient depth, and motion cadence.

It does not adopt:

- Vectra’s name, logo, copy, product data, or business concepts.
- Terminal windows, command prompts, execution traces, or file-path labels.
- Payment, wallet, receipt, or settlement metaphors.
- Technical language where a person-centered explanation is clearer.
- Fake metrics, fake investigations, simulated progress, or static values
  presented as live data.

Verith’s existing hooks, mutations, form bindings, query keys, routes, dialogs,
authorization, report actions, learning progress, and backend-derived states
remain unchanged. Only the presentation layer is rebuilt.

## Primary source files reviewed

- `frontend/app/globals.css`
- `frontend/tailwind.config.ts`
- `frontend/app/page.tsx`
- `frontend/components/shared/app-shell.tsx`
- `frontend/components/ui/*`
- `frontend/app/dashboard/page.tsx`
- `frontend/app/settings/page.tsx`
- Related request, receipt, detail, connection, and lifecycle pages
