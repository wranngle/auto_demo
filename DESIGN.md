# Wranngle Design System

Single source of truth for visual brand across all Wranngle repos.
Apply these tokens to every project to keep `wranngle.com`, internal tools,
emails, and proposal artifacts visually coherent.

> **Origin:** this document is the canonical public export of the Wranngle
> brand system, consolidated from the marketing-site OpenSpec, the email
> template style guide, the proposal-PDF default brand exports, and the
> internal GTM-engine tooling principles. All token values below are
> authoritative; conflicts between historic source docs are flagged inline.
>
> **Precedence:** the Color Palette section governs the marketing surface;
> the Email Patterns section governs transactional email; the Component
> Patterns section governs internal operator tools.

---

## 1. Brand Identity

### Tagline

> **Tame the Wild Frontier of AI.**

(`Wild Frontier` rendered in Sunset Orange `--s500`, balance in inverse text on dark hero.)

### Positioning sub-line

> The 24/7 AI Voice Agent for small trades businesses. Stop missing leads.

### Aesthetic identity

- **Console / terminal aesthetic** — monospaced labels (`[INFO]`, `[READY]`, `[WARN]`),
  high-contrast dark surfaces, animated typewriter sequences, blinking cursors,
  pulsing live indicators.
- **Lasso-inspired curves** — signature asymmetric corner radius
  (`24px 4px 24px 4px`) used on hero panels and feature consoles.
- **Operational over decorative** — internal tooling repos (`gtm_ops`)
  intentionally lean dense + scannable; no marketing hero sections.

---

## 2. Color Tokens

All colors documented as HEX. Convert to HSL only at the consumption layer
(e.g. shadcn/ui Tailwind vars).

### 2.1 Primary palette (canonical scales)

#### Sunset (Action / CTA — primary brand accent)

| Token | Hex | Notes |
|---|---|---|
| `--sunset-50`  | `#fff3e7` | |
| `--sunset-100` | `#ffe0bf` | |
| `--sunset-200` | `#ffc179` | |
| `--sunset-300` | `#ff9e33` | Maps to `--color-warning` (warm amber slot) |
| `--sunset-400` | `#ff7f00` | |
| `--sunset-500` | `#ff5f00` | **Primary CTA / brand orange** (= legacy `--s500`, `--wranngle-primary`) |
| `--sunset-600` | `#ef4b00` | hover state |
| `--sunset-700` | `#c73a00` | |
| `--sunset-800` | `#9f3000` | |
| `--sunset-900` | `#7d2700` | |
| `--sunset-950` | `#431300` | |

#### Violet (Critical / security / premium accent)

| Token | Hex | Notes |
|---|---|---|
| `--violet-50`  | `#fdf1f5` | |
| `--violet-100` | `#f9dce5` | |
| `--violet-200` | `#f2b6c6` | |
| `--violet-300` | `#ea8aa6` | |
| `--violet-400` | `#dd6186` | |
| `--violet-500` | `#cf3c69` | **Secondary brand magenta** (= legacy `--v500`, `--wranngle-secondary`); maps to `--color-critical` |
| `--violet-600` | `#b92a56` | |
| `--violet-700` | `#972144` | |
| `--violet-800` | `#741a36` | |
| `--violet-900` | `#561329` | |
| `--violet-950` | `#2d0914` | Used in dark-page radial gradient |

#### Sand (Neutral / background)

| Token | Hex | Notes |
|---|---|---|
| `--sand-50`  | `#fcfaf5` | **Light page background** (= `--wranngle-light`) |
| `--sand-100` | `#f6f1e7` | Muted surface |
| `--sand-200` | `#ebdfc8` | Subtle borders |
| `--sand-300` | `#dac39f` | Default borders |
| `--sand-400` | `#c2a677` | Strong borders |
| `--sand-500` | `#ab8c5b` | |
| `--sand-600` | `#957850` | |
| `--sand-700` | `#7a6343` | |
| `--sand-800` | `#625137` | |
| `--sand-900` | `#4f412d` | |
| `--sand-950` | `#292218` | |

#### Night (Dark / text)

| Token | Hex | Notes |
|---|---|---|
| `--night-50`  | `#f2f0f3` | |
| `--night-100` | `#e4e1e7` | |
| `--night-200` | `#cbc7d3` | |
| `--night-300` | `#aaa4b8` | |
| `--night-400` | `#847d9a` | `--text-muted` |
| `--night-500` | `#6a6380` | `--text-secondary` |
| `--night-600` | `#57516a` | |
| `--night-700` | `#464055` | |
| `--night-800` | `#393444` | |
| `--night-900` | `#201e28` | |
| `--night-950` | `#12111a` | **Primary text on light / dark page background** (= `--n950`, `--wranngle-dark`) |

### 2.2 Semantic mappings (web/marketing — `design_system.html`)

| Token | Value | Usage |
|---|---|---|
| `--color-action`        | `var(--sunset-500)` `#ff5f00` | All CTAs |
| `--color-action-hover`  | `var(--sunset-600)` `#ef4b00` | CTA hover |
| `--color-action-glow`   | `rgba(255, 95, 0, 0.25)`      | Button shadows / focus rings |
| `--color-critical`      | `var(--violet-500)` `#cf3c69` | Urgent attention, security context |
| `--color-warning`       | `var(--sunset-300)` `#ff9e33` | Caution states |
| `--color-healthy`       | `#5D8C61`                     | Cactus green — completed, positive |
| `--color-info`          | `#3b82f6`                     | Informational |

### 2.3 Email semantic palette (`email-templates/STYLE_GUIDE.md` + `master-template.html`)

Email clients require a separate, slightly different semantic stack
(higher-saturation reds/greens for client compatibility).

> **CONFLICT:** The web design system uses `#5D8C61` (Cactus Green) and `#ff9e33`
> (Sunset 300) for `healthy` / `warning`. The email system uses `#10b981`
> (success), `#f59e0b` (warning), `#ef4444` (danger). These intentionally
> diverge — keep web palette for the marketing site & internal dashboards;
> use the email palette only inside transactional templates. Cross-source values:
>   - Healthy/Success: web `#5D8C61` vs email `#10b981` (from `STYLE_GUIDE.md`)
>   - Warning: web `#ff9e33` vs email `#f59e0b` (from `STYLE_GUIDE.md`)
>   - Critical/Danger: web `#cf3c69` (violet brand) vs email `#ef4444` (pure red, danger only)

| Token | Hex | Usage |
|---|---|---|
| `--wranngle-primary`     | `#ff5f00` | CTAs, console labels, left borders, links |
| `--wranngle-secondary`   | `#cf3c69` | Security / premium contexts ONLY |
| `--wranngle-dark`        | `#12111a` | Body text, dark backgrounds |
| `--wranngle-light`       | `#fcfaf5` | Light mode backgrounds |
| `--wranngle-success`     | `#10b981` | Completed states ONLY (email-only) |
| `--wranngle-warning`     | `#f59e0b` | Action-required boxes (email-only) |
| `--wranngle-danger`      | `#ef4444` | Errors, security alerts (email-only) |
| `--wranngle-gray-600`    | `#6b7280` | Secondary body text |
| `--wranngle-gray-400`    | `#9ca3af` | Footer text |
| `--wranngle-gray-300`    | `#d1d5db` | Dividers |
| `--wranngle-border`      | `#e5e7eb` | Light borders |
| `--wranngle-bg-subtle`   | `#f9fafb` | Subtle backgrounds (info boxes) |
| `--wranngle-bg-page`     | `#f3f4f6` | Email wrapper background |

### 2.4 Surfaces / text / borders (web)

| Token | Value |
|---|---|
| `--surface-page`     | `var(--sand-50)` |
| `--surface-card`     | `#ffffff` |
| `--surface-elevated` | `#ffffff` |
| `--surface-muted`    | `var(--sand-100)` |
| `--surface-glass`    | `rgba(255, 255, 255, 0.7)` |
| `--text-primary`     | `var(--night-950)` `#12111a` |
| `--text-secondary`   | `var(--night-500)` `#6a6380` |
| `--text-muted`       | `var(--night-400)` `#847d9a` |
| `--text-inverse`     | `var(--sand-50)` `#fcfaf5` |
| `--border-subtle`    | `var(--sand-200)` `#ebdfc8` |
| `--border-default`   | `var(--sand-300)` `#dac39f` |
| `--border-strong`    | `var(--sand-400)` `#c2a677` |

### 2.5 Page background gradients

```css
/* Light page (App.tsx .bg-page-light) */
background: linear-gradient(to bottom, #fcfaf5, #ebdfc8);

/* Dark page (App.tsx .bg-page-dark) */
background: radial-gradient(circle at 50% 0%, #2d0914 0%, #12111a 60%);

/* Marketing showcase body */
background: linear-gradient(180deg, var(--sand-50) 0%, var(--sand-100) 50%, var(--violet-100) 100%);
```

### 2.6 Status colors (Tailwind config — for in-app presence states)

| Token | Value | Usage |
|---|---|---|
| `status.online`  | `rgb(34 197 94)` `#22c55e`  | Online indicator |
| `status.away`    | `rgb(245 158 11)` `#f59e0b` | Away |
| `status.busy`    | `rgb(239 68 68)` `#ef4444`  | Do not disturb |
| `status.offline` | `rgb(156 163 175)` `#9ca3af` | Offline |

### 2.7 Deprecated colors — DO NOT USE

| Color | Hex | Replacement |
|---|---|---|
| Sky Blue       | `#0ea5e9` | Use `#ff5f00` (Sunset 500) |
| Light Blue BG  | `#f0f9ff` | Use `#f9fafb` (neutral subtle) |
| Blue Border    | `#bae6fd` | Use `#e5e7eb` (neutral border) |

---

## 3. Typography

### 3.1 Font families

> **CONFLICT — INTENTIONAL SURFACE SPLIT:** Three different font stacks live in
> the codebase. They map to surfaces, not contexts. **Pick the right stack for
> the surface you are designing for.**
>
> | Surface | Display / Headings | Body | Mono | Source |
> |---|---|---|---|---|
> | **Marketing site (`wranngle.com` landing)** | Bricolage Grotesque (`.brand-font`) | DM Sans / Inter | JetBrains Mono (`.mono-font`) | `App.tsx` + `project.md` |
> | **Web design system (proposals, dashboards, presales reports)** | Outfit (`--font-display`) | Inter (`--font-body`) | `ui-monospace, SF Mono, Menlo` (`--font-mono`) | `openspec/design_system.html` |
> | **Email templates** | Inter | Inter | Courier New | `STYLE_GUIDE.md` |
>
> **Recommended unification path** (Cody to confirm):
> Standardize on **Bricolage Grotesque (display) + Inter (body) + JetBrains Mono (mono)**
> as the canonical stack. The Outfit/SF Mono stack in `design_system.html` is
> a leftover from an earlier iteration; the live marketing site has already
> moved to Bricolage. Email keeps Courier New for client compatibility (no
> change recommended).

#### Web token definitions

```css
--font-display: 'Bricolage Grotesque', 'Outfit', system-ui, sans-serif;
--font-body:    'Inter', system-ui, sans-serif;
--font-mono:    'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
```

Google Fonts import (combined for marketing site):

```html
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,400;500;700&family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### 3.2 Type scale (web)

| Token | Value | px | Usage |
|---|---|---|---|
| `--text-xs`   | `0.6875rem` | 11px | Footer legal, micro-labels |
| `--text-sm`   | `0.75rem`   | 12px | Console labels, metadata, captions |
| `--text-base` | `0.875rem`  | 14px | Buttons, small body |
| `--text-lg`   | `1rem`      | 16px | Primary body |
| `--text-xl`   | `1.25rem`   | 20px | H2 / section headings |
| `--text-2xl`  | `1.5rem`    | 24px | Sub-hero / large stats |
| `--text-3xl`  | `2rem`      | 32px | H1 hero |

**Marketing hero override:** App.tsx uses `text-5xl md:text-7xl` (Tailwind: 48px / 72px) for the brand tagline. Reserve for top-of-page hero only.

### 3.3 Type scale (email — slightly narrower)

| Token | Value | Usage |
|---|---|---|
| `--text-xs`   | 11px | Footer legal |
| `--text-sm`   | 12px | Console labels |
| `--text-base` | 14px | Buttons, small body |
| `--text-lg`   | 16px | Primary body |
| `--text-xl`   | 20px | H2 |
| `--text-2xl`  | 28px | H1 hero |

### 3.4 Weights & line-height

- Display headings: **800** (Outfit/Bricolage), letter-spacing `-0.02em`, line-height `1.1`–`1.2`.
- Body: **400** regular, **600** for emphasis, **700** for strong; line-height `1.5`–`1.6`.
- Buttons / labels: **700** uppercase, letter-spacing `0.03em`–`0.05em`, line-height `1.4`.
- Console labels: monospace, **700**, ALL CAPS, often bracketed `[INFO]`.

---

## 4. Spacing

8px-based scale. Use `--space-*` tokens; never hard-code px in components.

| Token | Value | px | Common usage |
|---|---|---|---|
| `--space-1`  | `0.25rem` | 4px  | Minimal gaps, micro-padding |
| `--space-2`  | `0.5rem`  | 8px  | Icon padding, tight spacing |
| `--space-3`  | `0.75rem` | 12px | Default element gap |
| `--space-4`  | `1rem`    | 16px | Standard margins, paragraph spacing |
| `--space-5`  | `1.25rem` | 20px | Info-box padding |
| `--space-6`  | `1.5rem`  | 24px | Hero padding, section gaps |
| `--space-8`  | `2rem`    | 32px | Major section breaks, page padding |
| `--space-10` | `2.5rem`  | 40px | Content-area padding |
| `--space-12` | `3rem`    | 48px | Showcase / page-level rhythm |

Email-specific aliases (same numeric scale, different names):
`xs=4 / sm=8 / md=12 / base=16 / lg=20 / xl=24 / 2xl=32 / 3xl=40`.

---

## 5. Border Radius

> **CONFLICT — INTENTIONAL SCALE SPLIT:** Three radius scales co-exist:
>
> | Surface | sm | md | lg | xl | 2xl | Source |
> |---|---|---|---|---|---|---|
> | **Web design system (canonical)** | 4px | 8px | 12px | 16px | 24px | `design_system.html` |
> | **Tailwind shadcn (`tailwind.config.ts`)** | 3px | 6px | 9px | — | — | one-off shadcn tweak |
> | **Email** | 4px | 8px | — | — | — | `STYLE_GUIDE.md` |
>
> **Recommendation:** Use the web design-system scale below as the source of
> truth. The shadcn-tweaked tailwind.config.ts radii are an
> outlier — bring them into alignment when refactoring the marketing site.

### Canonical scale (use everywhere)

| Token | Value | Usage |
|---|---|---|
| `--radius-sm`     | `4px`  | Small chips, info-box accents, status badges |
| `--radius-md`     | `8px`  | Cards, buttons, heroes |
| `--radius-lg`     | `12px` | Larger cards, section panels |
| `--radius-xl`     | `16px` | Page-level shells, component-section containers |
| `--radius-2xl`    | `24px` | Showcase headers, hero panels |
| `--radius-pill`   | `9999px` | Pills, badges, status dots, accent bars |
| `--radius-lasso`  | `0 var(--radius-lg) var(--radius-lg) 0` | **Signature asymmetric** — use on left-bordered accent cards |

**Console / hero-accent variant** (App.tsx — featured panel signature shape):
```css
border-radius: 24px 4px 24px 4px;
```

---

## 6. Shadows / Elevation

Layered, low-saturation shadows tinted with `rgba(18, 17, 26, …)` so they match the Night-950 text tone instead of pure black.

| Token | Value |
|---|---|
| `--shadow-xs`    | `0 1px 2px rgba(18, 17, 26, 0.04)` |
| `--shadow-sm`    | `0 2px 4px rgba(18, 17, 26, 0.04), 0 1px 2px rgba(18, 17, 26, 0.02)` |
| `--shadow-md`    | `0 4px 12px rgba(18, 17, 26, 0.06), 0 2px 4px rgba(18, 17, 26, 0.04)` |
| `--shadow-lg`    | `0 8px 24px rgba(18, 17, 26, 0.08), 0 4px 8px rgba(18, 17, 26, 0.04)` |
| `--shadow-xl`    | `0 16px 48px rgba(18, 17, 26, 0.12), 0 8px 16px rgba(18, 17, 26, 0.06)` |
| `--shadow-glow`  | `0 0 24px var(--color-action-glow)` (Sunset CTA halo) |
| `--shadow-inner` | `inset 0 2px 4px rgba(18, 17, 26, 0.06)` |

Page-context shadow tints (App.tsx):
- Light page card: `--shadow-card: 0 6px 16px rgba(18, 17, 26, 0.08);`
- Dark page card: `--shadow-card: 0 6px 16px rgba(0, 0, 0, 0.4);`

---

## 7. Motion

| Token | Value |
|---|---|
| `--ease-out`         | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--ease-in-out`      | `cubic-bezier(0.65, 0, 0.35, 1)` |
| `--duration-fast`    | `150ms` |
| `--duration-normal`  | `250ms` |
| `--duration-slow`    | `400ms` |

Recurring patterns:
- Card lift on hover: `transform: translateY(-1px)` + shadow step-up.
- Button lift on hover: `transform: translateY(-2px)`, settles to `(0)` on `:active`.
- Pulse for "live" indicators: 2s ease-in-out infinite, `scale(1) → scale(1.1)`, opacity `1 → 0.7`.
- Console typewriter: 800ms delay between lines.

---

## 8. Component Patterns (web)

Every component below uses the unified token system defined in section 3.
Markup conventions are stable; consumers should treat the rendered HTML
classes as the contract.

### 8.1 Card (`.card`)

Replaces: `.exec-summary`, `.summary-card`, `.fix-block`, `.bleed-callout`,
`.milestone-card`, `.scope-column`, `.zone-finops`, `.term-item`.

Base:
```css
background: var(--surface-card);
border: 1px solid var(--border-subtle);
border-radius: var(--radius-lg);
padding: var(--space-4) var(--space-5);
box-shadow: var(--shadow-sm);
transition: box-shadow .25s var(--ease-out), transform .25s var(--ease-out);
```

Variants:
- `.card--accent` — left 4px Sunset border + lasso radius + warm gradient
- `.card--critical` — Violet accent + violet-50 gradient
- `.card--warning`  — Sunset-300 accent
- `.card--healthy`  — Cactus green accent
- `.card--glass`    — backdrop-blur frosted
- `.card--elevated` — `--shadow-lg`, no border, larger lift on hover
- `.card--inset`    — `--surface-muted` + inner shadow
- `.card--sm` / `.card--lg` — padding tweaks
- `.card--interactive` — pointer cursor + hover border = Sunset 300

### 8.2 Stat (`.stat`)

Big-number metric block. Replaces `.stat-card`, `.zone-stat`, `.metric-chip`.

- Value: `--font-display`, `--text-2xl`, weight 800, line-height 1.1, `letter-spacing: -0.02em`
- Label: `--text-xs`, weight 600, uppercase, `letter-spacing: 0.05em`, `--text-muted`
- Background: linear-gradient(135deg, white → `--sand-100`)
- Variants: `--bordered` (3px Sunset left bar + lasso radius), `--highlight` (Sunset gradient bg), color states (`--accent`, `--critical`, `--warning`, `--healthy`)
- Sizes: `--sm` (text-lg value), default, `--lg` (text-3xl, padding-6)

### 8.3 Label (`.label`)

Block label / meta-text. Replaces `.term-label`, `.timeline-label`, `.floor-label`, etc.

- `--text-xs`, weight 600, uppercase, `letter-spacing: 0.05em`
- Color variants: `--accent`, `--critical`, `--warning`, `--healthy`, `--muted`
- `.label--inline` for in-paragraph use

### 8.4 Indicator (`.indicator`)

Status dot (replaces `.status-dot`, `.fix-dot`, `.bleed-dot`).

- 12px round (`--md` default), 8/16/24px size variants
- Linear-gradient fill + inset shadow + outer glow halo per state
- `.indicator--pulse` for live status

### 8.5 Badge (`.badge`)

Pill-style token (replaces `.pill`, `.risk-badge`, `.type-pill`, `.math-pill`, `.milestone-badge`, `.hosting-pill`).

- Default: sand background, secondary text, pill radius
- Semantic: `--accent` (Sunset), `--critical` (Violet), `--warning`, `--healthy`, `--info`
- Style variants: `--solid` (high contrast), `--outline`, `--code` (mono + dotted border), `--caps` (uppercase + bold)
- Tech-stack semantic colors: `--workflow`, `--ai`, `--database`, `--communication`, `--integration`, `--api`
- Sizes: `--sm`, default, `--lg`

### 8.6 Section (`.section`)

Layout block with numbered header.
- `.section__header` — flex, 2px sand-200 bottom border
- `.section__number` — Sunset-500 display number
- `.section__title` — display-font, weight 700

### 8.7 Button (`.btn`)

Web button (replaces ad-hoc CTAs).

```css
padding: 0.625rem 1.25rem; /* default; --sm and --lg variants */
font: 700 var(--text-sm) var(--font-display);
text-transform: uppercase;
letter-spacing: 0.03em;
border-radius: var(--radius-md);
```

- `.btn--primary` — Sunset gradient (500→600), white text, glow shadow, lift on hover
- `.btn--ghost`   — transparent, sand border, hovers to Sunset accent
- Sizes: `--sm` (text-xs), default, `--lg` (text-base)

### 8.8 Email button (`.btn-primary`, `.btn-secondary`, `.btn-warning`, `.btn-danger`)

Email-specific button (inline-styled for client compatibility):
- Padding `14px 32px`, border-radius `8px`, 2px solid border matching bg
- Font `'Inter', Arial, sans-serif`, 14px / weight 700, uppercase, letter-spacing `0.5px`
- Always include both class AND inline styles (email-client fallback)

### 8.9 Console aesthetic blocks

Distinctive Wranngle UI motif — dark monospaced panels with bracketed labels.

- Background: `#1a1a1e` (or `--night-900`/`--night-950`)
- Border-left: 4px Sunset
- Font: `'Courier New', Courier, monospace` (email) or `JetBrains Mono` (web)
- Color labels: `[INFO]` orange (`#ff5f00`), `[READY]` green (`#10b981`), `[WARN]` amber (`#f59e0b`), `[ERROR]` red (`#ef4444`)
- Optional animated border tracer using `--color-action`

### 8.10 Hero section (email)

```css
background: linear-gradient(135deg, #12111a 0%, #2d0914 100%);
border-radius: 8px;
padding: 24px;
/* H1: Inter 28px/700 white, line-height 1.2 */
/* Tagline: Courier New 14px Sunset, letter-spacing 1px, e.g. "[ SYSTEM STATUS ]" */
```

### 8.11 Layout utilities

- `.grid` / `.grid--2` / `.grid--3` / `.grid--4` (CSS grid, gap = `--space-4`)
- `.flex` / `.flex--wrap` / `.flex--center` / `.flex--between` / `.flex--gap-sm` / `.flex--gap-md`
- `.stack` (flex column, gap `--space-3`), `--sm` (gap-2), `--lg` (gap-6)

---

## 9. Voice & Tone

### 9.1 Brand voice

- **Confident frontier-tamer.** Tagline "Tame the Wild Frontier of AI" sets the
  posture: bold, plainspoken, slightly outlaw. Avoid academic / corporate hedging.
- **Operational clarity over marketing fluff.** Show the system working
  (live demos, console output, real numbers) instead of describing it.
- **Console-coded technical credibility.** Bracketed labels, monospaced metadata,
  and visible "system status" cues build trust with technical buyers.
- **Trades-business-readable.** Primary audience is HVAC / Plumbing / Electrical
  small businesses. Avoid AI jargon; lead with outcomes ("stop missing leads",
  "24/7 coverage", "$X recovered/month").

### 9.2 Surface-specific tone

| Surface | Tone | Source |
|---|---|---|
| Marketing site | Bold, confident, console-ish, outcome-led | App.tsx hero |
| Email — transactional | Calm, factual, brief; respects CAN-SPAM tone | STYLE_GUIDE.md |
| Email — sales | Direct, value-led, single clear CTA | STYLE_GUIDE.md |
| SMS / RCS | Compressed: greeting + key info + action + contact, ≤160 chars | STYLE_GUIDE.md |
| Internal tooling (`gtm_ops`) | Dense, scannable, operational. No marketing flourish. Show synthetic-data labels prominently. | gtm_ops/docs/DESIGN.md |

### 9.3 Writing rules (carried from email STYLE_GUIDE)

- Never say "Reply to this email" when the sender is `noreply@`.
- All "contact support" mentions must include the specific email
  (`support@`, `billing@`, or `security@wranngle.com`).
- Match sender address to context expectation.
- Button labels: action verb first ("View Invoice", "Schedule Demo", "Deploy Agent"). Avoid "Click Here".
- Button labels are uppercase in web/email; max 25 chars (RCS), max 20 chars (RCS button).
- Console labels stay in `[BRACKETS]`, ALL CAPS, monospace.

---

## 10. Logo & Mark

### Confirmed assets

- RCS messaging logo card — square brand mark on the night-950 surface
- RCS branded sender display name: **"Wranngle"**

### Required assets per RCS carrier-approval spec

- Brand logo: square, **min 1024×1024px**
- Brand banner: optional, **1440×720px**

### Open logo questions

The following logo-system facets are not yet specified:

- Formal logo-usage rules (clearspace, minimum size, padding contracts).
- Canonical SVG / vector source path for the brand mark.
- Wordmark vs. icon-only treatment guidance.
- Light/dark logo variants and which surface picks which.

---

## 11. Color Usage Rules (consolidated do's and don'ts)

### Sunset Orange (`#ff5f00`) — Primary

DO use for: CTA backgrounds, left accent borders on info boxes, console labels,
in-body links, step-indicator badges, brand highlights.
DON'T use for: body text (low contrast), large background fills (overwhelming),
error states (use Danger Red).

### Violet / Magenta (`#cf3c69`) — Secondary

DO use for: security-context borders (password reset, 2FA), premium / VIP indicators,
sensitive information boxes, "Critical" semantic state.
DON'T use for: general info boxes, CTA buttons, regular links.

### Cactus Green (`#5D8C61` web / `#10b981` email) — Healthy

DO use for: completed states, payment confirmations, `[READY]` / `[SUCCESS]` labels,
checkmarks for done items.
DON'T use for: pending steps, generic info, CTAs.

### Sunset 300 (`#ff9e33` web) / Amber (`#f59e0b` email) — Warning

DO use for: action-required boxes, time-sensitive notices, warning buttons.
DON'T use for: success states, generic info.

### Danger Red (`#ef4444`) — Errors / Security alerts (email primarily)

DO use for: security alerts, error messages, escalation buttons, critical warnings.
DON'T use for: general warnings (use Amber/Sunset 300), normal action buttons.

---

## 12. Accessibility

- Maintain **4.5:1 contrast ratio** for normal text, **3:1** for large text (WCAG AA).
- The runtime branding helper `unified-presales-report/lib/branding.ts` enforces this via `meetsContrastRequirement()`.
- Always provide alt text on images.
- Don't rely on color alone for meaning (pair with icons / labels).
- Test layouts at 320px mobile width.
- `input, select, textarea { font-size: 16px; }` to prevent iOS auto-zoom.

---

## 13. Implementation Templates

### CSS variables (drop into `:root`)

```css
:root {
  /* Sunset */
  --sunset-50:#fff3e7; --sunset-100:#ffe0bf; --sunset-200:#ffc179;
  --sunset-300:#ff9e33; --sunset-400:#ff7f00; --sunset-500:#ff5f00;
  --sunset-600:#ef4b00; --sunset-700:#c73a00; --sunset-800:#9f3000;
  --sunset-900:#7d2700; --sunset-950:#431300;

  /* Violet */
  --violet-50:#fdf1f5; --violet-100:#f9dce5; --violet-200:#f2b6c6;
  --violet-300:#ea8aa6; --violet-400:#dd6186; --violet-500:#cf3c69;
  --violet-600:#b92a56; --violet-700:#972144; --violet-800:#741a36;
  --violet-900:#561329; --violet-950:#2d0914;

  /* Sand */
  --sand-50:#fcfaf5; --sand-100:#f6f1e7; --sand-200:#ebdfc8;
  --sand-300:#dac39f; --sand-400:#c2a677; --sand-500:#ab8c5b;
  --sand-600:#957850; --sand-700:#7a6343; --sand-800:#625137;
  --sand-900:#4f412d; --sand-950:#292218;

  /* Night */
  --night-50:#f2f0f3; --night-100:#e4e1e7; --night-200:#cbc7d3;
  --night-300:#aaa4b8; --night-400:#847d9a; --night-500:#6a6380;
  --night-600:#57516a; --night-700:#464055; --night-800:#393444;
  --night-900:#201e28; --night-950:#12111a;

  /* Semantic */
  --color-critical: var(--violet-500);
  --color-warning:  var(--sunset-300);
  --color-healthy:  #5D8C61;
  --color-info:     #3b82f6;
  --color-action:   var(--sunset-500);
  --color-action-hover: var(--sunset-600);
  --color-action-glow:  rgba(255, 95, 0, 0.25);

  /* Surfaces */
  --surface-page: var(--sand-50);
  --surface-card: #fff;
  --surface-elevated: #fff;
  --surface-muted: var(--sand-100);
  --surface-glass: rgba(255,255,255,.7);

  /* Text */
  --text-primary:   var(--night-950);
  --text-secondary: var(--night-500);
  --text-muted:     var(--night-400);
  --text-inverse:   var(--sand-50);

  /* Borders */
  --border-subtle:  var(--sand-200);
  --border-default: var(--sand-300);
  --border-strong:  var(--sand-400);

  /* Spacing */
  --space-1:.25rem; --space-2:.5rem; --space-3:.75rem; --space-4:1rem;
  --space-5:1.25rem; --space-6:1.5rem; --space-8:2rem; --space-10:2.5rem; --space-12:3rem;

  /* Typography */
  --font-display:'Bricolage Grotesque','Outfit',system-ui,sans-serif;
  --font-body:'Inter',system-ui,sans-serif;
  --font-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,'SF Mono',Menlo,monospace;
  --text-xs:.6875rem; --text-sm:.75rem; --text-base:.875rem; --text-lg:1rem;
  --text-xl:1.25rem; --text-2xl:1.5rem; --text-3xl:2rem;

  /* Radii */
  --radius-sm:4px; --radius-md:8px; --radius-lg:12px; --radius-xl:16px;
  --radius-2xl:24px; --radius-pill:9999px;
  --radius-lasso:0 var(--radius-lg) var(--radius-lg) 0;

  /* Shadows */
  --shadow-xs:0 1px 2px rgba(18,17,26,.04);
  --shadow-sm:0 2px 4px rgba(18,17,26,.04),0 1px 2px rgba(18,17,26,.02);
  --shadow-md:0 4px 12px rgba(18,17,26,.06),0 2px 4px rgba(18,17,26,.04);
  --shadow-lg:0 8px 24px rgba(18,17,26,.08),0 4px 8px rgba(18,17,26,.04);
  --shadow-xl:0 16px 48px rgba(18,17,26,.12),0 8px 16px rgba(18,17,26,.06);
  --shadow-glow:0 0 24px var(--color-action-glow);
  --shadow-inner:inset 0 2px 4px rgba(18,17,26,.06);

  /* Motion */
  --ease-out:cubic-bezier(.16,1,.3,1);
  --ease-in-out:cubic-bezier(.65,0,.35,1);
  --duration-fast:150ms; --duration-normal:250ms; --duration-slow:400ms;
}
```

### Tailwind config snippet (for new repos)

```js
// tailwind.config.{js,ts}
extend: {
  colors: {
    sunset: { 50:'#fff3e7',100:'#ffe0bf',200:'#ffc179',300:'#ff9e33',400:'#ff7f00',500:'#ff5f00',600:'#ef4b00',700:'#c73a00',800:'#9f3000',900:'#7d2700',950:'#431300' },
    violet: { 50:'#fdf1f5',100:'#f9dce5',200:'#f2b6c6',300:'#ea8aa6',400:'#dd6186',500:'#cf3c69',600:'#b92a56',700:'#972144',800:'#741a36',900:'#561329',950:'#2d0914' },
    sand:   { 50:'#fcfaf5',100:'#f6f1e7',200:'#ebdfc8',300:'#dac39f',400:'#c2a677',500:'#ab8c5b',600:'#957850',700:'#7a6343',800:'#625137',900:'#4f412d',950:'#292218' },
    night:  { 50:'#f2f0f3',100:'#e4e1e7',200:'#cbc7d3',300:'#aaa4b8',400:'#847d9a',500:'#6a6380',600:'#57516a',700:'#464055',800:'#393444',900:'#201e28',950:'#12111a' },
  },
  fontFamily: {
    display: ['Bricolage Grotesque','Outfit','system-ui','sans-serif'],
    sans:    ['Inter','system-ui','sans-serif'],
    mono:    ['JetBrains Mono','ui-monospace','SFMono-Regular','SF Mono','Menlo','monospace'],
  },
  borderRadius: { sm:'4px', md:'8px', lg:'12px', xl:'16px', '2xl':'24px' },
}
```

### Default brand exports (JS — mirrors `gtm_ops/lib/branding.ts`)

```js
export const DefaultBranding = {
  PRIMARY_COLOR:    '#ff5f00',  // Sunset 500
  SECONDARY_COLOR:  '#cf3c69',  // Violet 500
  BACKGROUND_COLOR: '#fcfaf5',  // Sand 50
  TEXT_COLOR:       '#12111a',  // Night 950
  SUCCESS_COLOR:    '#5D8C61',  // Cactus Green
};
```

---

## 14. Open Questions / Gaps for Cody

1. **Font stack consolidation** — confirm Bricolage Grotesque + Inter +
   JetBrains Mono is the canonical stack going forward (current state has 3
   coexisting stacks across surfaces).
2. **Logo system** — no formal logo doc exists. Need: vector source, light/dark
   variants, clearspace, min sizes, wordmark vs. icon rules.
3. **Tailwind shadcn radius reconciliation** — the marketing-site Tailwind
   config uses 3/6/9px radii while the rest of the system uses 4/8/12px.
   Pick one.
4. **shadcn HSL stubs** — the marketing-site shadcn HSL channel
   vars are still "red" defaults and should be filled with the canonical
   Sunset / Violet / Sand / Night conversions if shadcn components are
   intended to actually render in-brand.
5. **Form / input components** — no documented styling rules for inputs,
   selects, textareas. Currently relies on implicit Tailwind defaults.
6. **Iconography** — Lucide React is in use, but no documented size scale or
   color-pairing rules.
7. **Animation library** — Framer Motion is in use but no documented motion
   patterns (entrance, exit, stagger). Section 7 covers easing + duration only.

---

*Last updated: 2026-05-02. When you change any token, update this file first
and ripple changes outward.*
