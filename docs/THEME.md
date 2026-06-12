# Sky Novel Hermes — Theme & UI Specification

This document is the source of truth for the desktop app's visual design. All UI
work must follow these rules. The implementation lives in two files:

- `apps/desktop/src/theme.css` — design tokens (the only place color literals are allowed).
- `apps/desktop/src/styles.css` — component/layout styles that consume tokens via `var(--*)`.

## Core principles

- **Tool-class aesthetic.** Dense, information-first layouts. Panels, tables, badges, and
  focused toolbars instead of marketing-style hero sections or decorative card nesting.
- **Tokens only.** Components and `styles.css` must never hard-code color values. Use
  `var(--token)`. Hex/rgb literals are permitted **only** in `theme.css`.
- **Effect-driven feedback.** State changes are reflected visually: toasts for action
  results, animated progress bars, pulsing "running" indicators, live row-flash on
  WebSocket updates, skeleton loaders during fetches, and view/hover/press transitions.
- **Dark-first.** Dark is the default theme; light is an opt-in toggle persisted in
  `localStorage` under `hermes-theme`. The theme attribute is set on
  `document.documentElement` (`data-theme="dark" | "light"`) and bootstrapped inline in
  `index.html` to avoid a flash of the wrong theme.

## Token reference

Tokens are defined in `theme.css`. Non-color tokens live under the global `:root`;
color tokens are themed under `:root, :root[data-theme="dark"]` and
`:root[data-theme="light"]`.

### Structural tokens (theme-independent)

| Group | Tokens |
| --- | --- |
| Radii | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill` |
| Spacing | `--space-1` … `--space-6` |
| Typography | `--font-sans`, `--font-mono`, `--fs-xs` … `--fs-3xl` |
| Motion | `--dur-fast`, `--dur-med`, `--dur-slow`, `--ease`, `--ease-out` |
| Layering | `--z-sticky`, `--z-toast` |

### Color tokens (themed)

| Group | Tokens |
| --- | --- |
| Surfaces | `--bg-app`, `--bg-sunken`, `--bg-panel`, `--bg-raised`, `--bg-hover`, `--bg-active` |
| Borders | `--border`, `--border-strong` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-inverse` |
| Accent | `--accent`, `--accent-hover`, `--accent-active`, `--accent-soft`, `--accent-contrast` |
| Focus | `--focus-ring` |
| Elevation | `--shadow-sm`, `--shadow-md`, `--shadow-pop` |
| Status (bg/fg pairs) | `--status-{queued,running,paused,completed,failed,cancelled}-{bg,fg}` |
| Danger | `--danger`, `--danger-hover`, `--danger-soft` |
| Warning | `--warn-bg`, `--warn-border`, `--warn-fg` |
| Effects | `--highlight-flash`, `--skeleton-base`, `--skeleton-sheen` |
| Diff (bg/fg pairs) | `--diff-ins-bg`, `--diff-ins-fg`, `--diff-del-bg`, `--diff-del-fg` |

## Component guidelines

- **Buttons** (`Button` in `ui.tsx`): variants `primary`, `secondary`, `danger`, `ghost`.
  Use `primary` for the main action in a panel, `secondary` for neutral actions, `ghost`
  for low-emphasis inline actions, `danger` for destructive actions. Pass `loading` to
  show an inline `Spinner` and disable the button.
- **Panel** (`Panel`): the standard container. Use `title` and `actions` for the header.
- **StatusBadge**: render task/book status with `status` (a known status string). Chinese
  labels come from `statusLabel()` in `utils.ts`.
- **ProgressBar**: pass `value`, `total`, and `status`. Omitting/zeroing `total` while
  running renders an indeterminate bar.
- **Skeleton / SkeletonRows**: show while data is loading instead of empty tables.
- **EmptyState**: show when a list/table has no data, with an icon, title, and hint.
- **Toasts** (`useToast()`): `success` / `error` / `info` for action outcomes. Do not use
  toasts for persistent state — use badges/inline UI for that.

## Motion & effects

- View switches animate with `viewEnter` (the view container has key `active`).
- "Running" status pulses (`badge-running`, `dot-running`).
- Progress fill transitions on width change; indeterminate state animates left→right.
- Table rows flash (`row-flash`) for ~1.4s when their task receives a live WebSocket update.
- Skeletons shimmer; toasts slide in from the right.
- Buttons lift/press on hover/active; nav items highlight with an accent rail.

## Accessibility

- Maintain readable contrast: body text uses `--text-primary`, secondary info
  `--text-secondary`, de-emphasized hints `--text-muted`.
- All interactive elements expose a visible focus ring via `--focus-ring`.
- **Reduced motion:** `styles.css` includes a `@media (prefers-reduced-motion: reduce)`
  block that neutralizes animations/transitions. New animations must remain acceptable
  when motion is reduced (no essential information conveyed by motion alone).
- Status is never conveyed by color alone — badges include a text label.

## Adding or changing styles

1. Need a new color? Add a token to **both** theme blocks in `theme.css`, then reference it.
2. Never introduce a raw color literal in `styles.css` or component files.
3. Reuse spacing/radius/typography/motion tokens rather than magic numbers where practical.
4. Keep status styling driven by the `--status-*` token pairs so all states stay consistent.
