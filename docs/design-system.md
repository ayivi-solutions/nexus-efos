# Nexus EFOS — Design System Reference
**Doc §75 EUXS Volume IV/VIII (Design System / Component Library)**
**Source of truth:** `web/tailwind.config.ts` + `web/app/globals.css` — this document describes what's actually implemented, not an aspirational target. Every value below was pulled directly from those two files, not re-typed from memory.

---

## 1. Color tokens

All values verified against WCAG AA (4.5:1 minimum for normal text) as of the 25 Jul 2026 accessibility pass — three tokens (`text.muted`, `gold.600`, `rose.600`) were darkened from their original values specifically to pass this bar; the darkened values are what's listed here.

### Ink (navy — chrome, dark surfaces)
| Token | Hex | Usage |
|---|---|---|
| `ink-950` / `ink-900` | `#050d1a` | Pinned identical — top bar, sidebar, primary dark surface |
| `ink-850` | `#0f2444` | Login screen background |
| `ink-800` | `#163660` | Active sidebar item background |
| `ink-700` | `#1a3a6b` | Deepest chrome variant |

### Gold (brand accent)
| Token | Hex | Usage | Contrast |
|---|---|---|---|
| `gold-300` | `#efdba3` | Lightest accent | — |
| `gold-400` | `#e2c46a` | Dark-button text, active nav text | — |
| `gold-500` | `#C8A951` | Primary CTA background, focus ring | — |
| `gold-600` | `#876e32` | Links/accent text at normal size | 4.52:1 on paper-0 |

### Paper (light backgrounds)
| Token | Hex | Usage |
|---|---|---|
| `paper-0` | `#FAF6EE` | App background |
| `paper-50` | `#F6EDD9` | Table header background, disabled input background |
| `paper-100` | `#efe0b8` | Card borders |

### Status colors
| Token | Hex | Usage | Contrast |
|---|---|---|---|
| `green-600` / `green-100` | `#16613A` / `#E8F5EE` | Success states, ACTIVE badges | passes AA |
| `rose-600` / `rose-100` | `#a06114` / `#FDF3DC` | Error/danger states, rejected/blacklisted badges | 4.52:1 |
| `violet-500` | `#8BA3BC` | Inactive sidebar nav text | 7.47:1 on ink-900 (dark surface only — do not reuse on light backgrounds) |

### Text
| Token | Hex | Usage | Contrast |
|---|---|---|---|
| `text-900` | `#08172E` | Primary body text | passes AA |
| `text-700` | `#33475c` | Secondary body text | passes AA |
| `text-500` | `#4E6580` | Tertiary/label text | passes AA |
| `text-muted` | `#557393` | Muted/helper text, timestamps | 4.57:1 on paper-0 |

**Deliberate non-obvious decision:** `violet-500` and `text-muted`'s *pre-accessibility-fix* value share the same underlying hex (`#8BA3BC`), but they are not interchangeable — `violet-500` is only ever used on the dark `ink-900` background (7.47:1, already compliant), while `text-muted` needed independent darkening for light backgrounds. Do not use `violet-500` on a light background.

---

## 2. Typography

| Token | Font stack | Usage |
|---|---|---|
| `font-display` | Fraunces, Georgia, serif | Headings (`h1`/`h2`), page titles |
| `font-body` | IBM Plex Sans, sans-serif | Default body text (applied at the `body` level) |
| `font-mono` | IBM Plex Mono, monospace | Account numbers, IDs, code-like values |

Loaded via Google Fonts in `globals.css`: weights 300/500/600/700 for Fraunces, 400/500/600/700 for IBM Plex Sans, 400/500/600 for IBM Plex Mono.

---

## 3. Layout

| Token | Value | Meaning |
|---|---|---|
| `dt` breakpoint | `960px` | The one breakpoint that matters most — below it, the app shell is mobile (bottom tab bar, drawer nav); at/above it, persistent sidebar. Matches the original concept document's own shell specification exactly. |
| `sm` / `lg` / `xl` | `640px` / `1024px` / `1280px` | Standard Tailwind breakpoints, used sparingly for grid column counts |
| `shell-top` | `56px` | Fixed top bar height |
| `tabbar` | `64px` | Mobile bottom tab bar height |
| Border radius | `sm: 6px`, `md: 12px`, `lg: 20px` | — |

---

## 4. Component classes

All defined in `globals.css`'s `@layer components`. These are the actual, only styling primitives used throughout every page in the app — there is no other component library.

### `.input`
White background, `paper-100` border, gold focus glow (`focus:border-gold-500` + a soft box-shadow), muted placeholder text, disabled state at 55% opacity. Applies to `<input>`, `<textarea>`, `<select>` uniformly. `select.input` additionally gets a custom chevron (inline SVG, gold stroke) replacing the native browser arrow.

### `.card`
White background, `paper-100` border, two-layer soft shadow. The base container for every content block in the app — forms, tables, stat groups, detail sections.

### `.btn-primary`
Gold background (`gold-500`), dark ink text, lifts 1px on hover with an amber glow shadow. The main action in any form (Save, Create, Confirm).

### `.btn-dark`
Ink background, gold text, same hover-lift pattern. Used for secondary/navigational actions — "+ New X" buttons, page-level actions that aren't the primary form submission.

### `.btn-text`
No background — underlined-on-hover text link styling at 12.5px. Used for inline row actions (Approve, Reject, Deposit, Withdraw, Remove) inside tables and cards.

### `.badge`
Small pill, 11px text, used for every status indicator app-wide (`ACTIVE`, `PENDING`, `BLACKLISTED`, etc.) — always paired with a semantic color combination from the palette above (never color alone; badges always carry the status text too, satisfying EUXS §165 Colour Accessibility).

### `.table-modern`
Applied to the `<table>` element inside a `.card.overflow-x-auto` wrapper. Header row: `paper-50` background, uppercase 11px muted text. Body rows: top border, subtle hover highlight. Consistent `16px`/`12px` cell padding.

### `.selectable`
The one deliberate exception to the app-wide `user-select: none` "app shell, not a webpage" feel (see §5 below) — marks specific real data values (names, account numbers, KPI figures, phone numbers) as copyable, while everything else (nav labels, buttons, decorative UI) stays non-selectable by default.

---

## 5. Interaction conventions

- **Focus indicator:** every button, link, and `[role="button"]`/`[tabindex]` element gets an on-brand gold `box-shadow` ring on `:focus-visible` (keyboard navigation only, not mouse clicks) — added in the EUXS Accessibility pass, previously relied on the browser's unstyled default.
- **Selection model:** UI chrome (nav, buttons, labels) is non-selectable by design, matching a native-app feel rather than a webpage; only `.selectable`-marked real data values can be copied.
- **Decorative icons:** every icon glyph used purely for visual reinforcement (nav icons, status symbols) is marked `aria-hidden="true"` — the adjacent text label is what screen readers actually announce.
- **Toasts:** `role="alert"` (errors, assertive) vs `role="status"` (success/info, polite) + `aria-live`, so screen readers are notified automatically as they appear.

---

## 6. What this document deliberately does not claim

This catalogs what exists — it is not the EUXS's full Volume IV/VIII vision. Explicitly out of scope here: a formal design-token *export pipeline* (Figma → code sync), a component-approval governance process, dark/high-contrast theme variants, or a versioned component changelog. Those are organizational/tooling practices, not something a reference document alone can satisfy — see the tracker's own note on why §74/§75 stay honestly Partial rather than Built.
