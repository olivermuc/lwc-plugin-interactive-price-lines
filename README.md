# Interactive price lines — handoff

`@tradingview/lwc-plugin-interactive-price-lines` is an experimental
Lightweight Charts™ series primitive for alerts and order levels. It extends
the ideas in `lwc-plugin-user-price-lines`, but adds draggable visual controls,
host-owned editing, and application actions.

This document is the current product and engineering handoff. **Read it fully
before making the next change.** Together with the source zip it must always be
enough to start a fresh chat and continue the work.

- **Last released plugin version: v1.0** (see "Current implementation").
- **Next target: v1.1**: everything under "Required next changes".

## GENERAL project notes (workflow rules, MUST follow)

1. `README.md` documents the last official plugin version.
   1. SOURCE CODE CHANGES: ALWAYS keep this file current with every version drop.
   2. If there is no plugin version yet, start with v1.0.
2. OUTPUT FORMAT: every code drop MUST be a **patch file**, not a copy of the
   entire source.
   1. With every patch for download, give a short summary line of what was
      done, to be used as the git commit message.
      1. Format: `vX.Y: {message}`
      2. NO `"` (double quotes) in the text, use `` ` `` (backticks) if needed.
3. VERSIONING
   1. After changes, bump the plugin version in the source **and** in the
      version file.
   2. MUST USE FORMAT: `v[X].[Y]`
      - X: major version change, triggered by the user only.
      - Y: minor version change, incremented by the assistant with every
        packaged drop.
4. UPDATE `README.md` with every drop (version, status of the checklist below,
   new decisions).
5. If more context is needed than the plugin package (e.g. the whole
   lightweight-charts source), ask the user; they will zip it up.

### Version bookkeeping (DECIDED)

`package.json` is the single source of truth for the version; there is no
version constant in the source.

- `package.json` uses semver, so release `vX.Y` is stored as `X.Y.0`
  (v1.1 → `"version": "1.1.0"`).
- Keep `Version-X.Y.txt` in sync on every drop: rename/replace it so the file
  name and its content match the new version (content: `vX.Y` plus the commit
  message line). The v1.0 zip has an empty `Version-1.0.txt` and
  `package.json` at `0.1.0`; the first drop (v1.1) must correct both
  (package.json → `1.1.0`, add `Version-1.1.txt`, remove `Version-1.0.txt`).

## Repository and package

- Repository: `/Users/oliver/Code/lightweight-charts`
- Package: `packages/lwc-plugin-interactive-price-lines`
- Entry point: `src/interactive-price-lines.ts` (~270 lines, single file)
- Demo: `src/example/example.ts` + `src/example/index.html`
- Reference implementation: `packages/lwc-plugin-user-price-lines`
- Interaction reference: the official `lwc-plugin-brushable-area-series`
  documentation; use it for gesture ownership, not for its custom-series
  architecture.

```sh
pnpm --filter @tradingview/lwc-plugin-interactive-price-lines build
pnpm --filter @tradingview/lwc-plugin-interactive-price-lines typecheck
pnpm --filter @tradingview/lwc-plugin-interactive-price-lines dev --host 127.0.0.1
```

Dependencies: peer `lightweight-charts ^5.0.0`, `fancy-canvas ~2.1.0`,
workspace `@tradingview/lwc-toolkit` (`Delegate`, `PluginBase`).

## Current implementation (v1.0)

`InteractivePriceLines` is a series primitive attached with:

```ts
const lines = new InteractivePriceLines(chartContainer);
series.attachPrimitive(lines);
```

The chart container is deliberately passed in. The public chart API does not
expose pointer-down / pointer-up subscriptions, so the primitive uses
capture-phase `PointerEvent` listeners (`pointerdown`, `pointermove`,
`pointerup`, `pointercancel`) on the supplied container to support a real held
drag. While an order handle is held, it temporarily applies
`{ handleScroll: false, handleScale: false }` and restores the host's prior
options on pointer-up or pointer-cancel.

Public methods:

- `addLine(options)` creates a tracked price line (also creates a native
  `series.createPriceLine` for the axis label) and returns its public data.
  Throws on duplicate id or if not attached.
- `updateLine(id, patch)` updates price, styling and label data after host
  validation. Throws on unknown id.
- `removeLine(id)` removes a tracked line; returns boolean.
- `lines()` returns the current public line data.
- `editRequested()`, `actionClicked()`, `priceChanged()` return toolkit
  subscriptions.

Current events:

```ts
lines.editRequested().subscribe(({ line, field, anchor }) => {
  // Host opens its own accessible HTML input at `anchor` (viewport coords).
  // Commit via lines.updateLine(line.id, { [field]: validatedValue });
});

lines.actionClicked().subscribe(({ line, action }) => {
  // Host performs the business action, e.g. cancel or confirm an order.
});

lines.priceChanged().subscribe(({ line, previousPrice }) => {
  // Fired on pointer-up with the final drag price.
});
```

Current types (v1.0): `InteractivePriceLineAction = 'cancel' | 'confirm'`,
`InteractivePriceLineField = 'quantity' | 'label'`,
`InteractivePriceLineOptions { id, price, color?, quantity?, label?, actions? }`.

### v1.0 rendering / geometry (what exists today, to be replaced)

- `lineRects(line, y, paneWidth)` is the single geometry source for drawing and
  hit testing. Layout is right-aligned in the pane with an 8px margin:
  handle disk (r=10) → gap 8 → quantity box → label box → cancel box →
  confirm box. Boxes are 22px high, width `max(22, ceil(len*7.2+16))`.
- **Quantity width is 0 when `quantity === ''`**, so an empty quantity has no
  visible or clickable segment. This is the bug behind "quantity field must
  always render".
- Colours are hard-coded: handle fill `#101014`, quantity fill `#A71D31`,
  label fill = line colour, cancel fill `#3C4048` with `×`, confirm fill
  `#089981` with `✓`, text `#FFFFFF`. None of this matches the target design.
- The canvas draws its own dashed line (`4px/4px`) across the pane in addition
  to the native price line created by `addLine`. Verify the two are not
  visibly doubled when restyling; the canvas line must be the one that masks
  under controls.
- Hit test order: `confirm, cancel, quantity, label, handle`; lines iterated in
  reverse insertion order. `hitTest()` returns external ids
  `interactive-price-lines:<id>:<area>`, cursor `ns-resize` for the handle,
  `pointer` otherwise.
- Only the handle starts a drag. Pointer-down on any other area fires either
  `editRequested` (quantity / label) or `actionClicked` immediately (to be
  replaced by the click-vs-drag gesture model).
- There is no hover tracking, no `contextmenu` handling, no `lineType`, no
  background colour option.

### Prototype verification so far

Manual: quantity `10 → 25` via host editor; a held drag changed `105 → 99.17`;
Cancel emitted an action event. The demo in the zip still uses a single
`sell-limit-1` line; the user tests locally with the six-line `DEMO_LINES`
fixture below (with a `DEMO_COLORS` map that is **not** in the zip; recreate
it in the demo from the host tokens, see "Host design tokens").

## Agreed host / plugin boundary

The plugin owns canvas rendering, hit testing, pointer gestures, line state,
and semantic interaction events. The host owns:

- popup/input/context-menu DOM, focus management and keyboard handling;
- validation, numeric precision, localization and formatting;
- domain actions such as cancel, confirm, submit or modify an order;
- persistence and remote API calls.

This is intentional: Lightweight Charts primitives paint on canvas and cannot
provide an accessible editable input by themselves.

## Decisions log (agreed with the user)

| Topic | Decision |
| --- | --- |
| Version source | `package.json`; `Version-X.Y.txt` kept in sync |
| Dragging | The **entire line and all controls** are draggable (as in the regular TradingView UI). A dedicated grip box also exists as an explicit affordance |
| Click vs drag | Press on any control arms a gesture. Movement beyond a small threshold (suggested 4 CSS px) starts a price drag; release without movement is a click (edit / action). Actions and edits fire on pointer-up, not pointer-down |
| `✓` confirm | Kept. Only confirm tells the host to commit the real order |
| `✕` / `✓` placement | Both left of the `quantity \| label` box |
| `✕` / `✓` visibility | Visible while the order is **not yet confirmed**; once confirmed, only while hovering the price line or the `quantity \| label` box |
| `lineType` | `'alert' \| 'order'`, **immutable** after `addLine` |
| Background colour | Passed once to the plugin; **no theme switching**, so no setter / no `applyOptions` for it |
| Colours | Passed in by the host, resolved from the host CSS tokens (see "Host design tokens") |
| Context menu `preventDefault` | **Postponed.** Interim behaviour: call `preventDefault()` whenever the plugin emits the event (right click inside the pane) so the host menu shows instead of the browser's. Revisit later |
| Tests | Do not exist yet; create `tests/interactions` and `tests/graphics` from scratch in this package (the `user-price-lines` folders are only a naming/structure model, they are not available) |

## Required next changes (v1.1 checklist)

Status legend: `[ ]` open, `[x]` done. Update this list every drop.

### 1. Context menu event `[ ]`

Right-clicking the pane must emit a host event suitable for a context menu.
It must include the clicked price and, when the pointer is close to a plugin
line/control, that line's `id` and complete public data.

```ts
interface InteractivePriceLineContextMenuEvent {
  price: number | null;               // coordinateToPrice(y); null if unavailable
  line: InteractivePriceLine | null;  // nearest plugin line if close, else null
  clientX: number;
  clientY: number;
}

lines.contextMenuRequested().subscribe(event => openContextMenu(event));
```

- Listen for `contextmenu` (capture) on the container; use the same
  `_localPoint` bounds check as the pointer handlers.
- "Close to a line" = inside any visible control rect of that line, or within
  the line band (same ±2 CSS px as dragging; document the final value).
- `preventDefault()`: postponed, see decisions log (interim: whenever emitted).
  Background: the browser opens its native context menu on right click;
  `preventDefault()` suppresses it so the host's own menu is the only one.
- The host uses `updateLine()` and `removeLine()` for target price, styling and
  lifecycle changes. These exist; make sure `updateLine` covers colour, label,
  quantity, price, actions and `confirmed`, and works for both line types
  (`lineType` itself is not patchable).

### 2. Explicit line type `[ ]`

Add `lineType: 'alert' | 'order'` to `InteractivePriceLineOptions` and to the
public `InteractivePriceLine`. Suggested default `'order'` so v1.0 callers keep
working; update all existing data (demo) to pass it. **Immutable**: not part of
the `updateLine` patch type (use `Omit<..., 'id' | 'lineType'>`).

### 3. Order confirmation state `[ ]`

New option/state `confirmed?: boolean` (default `false`) for **order** lines,
patchable through `updateLine`. The plugin never sets it itself: the host
commits the order after the `confirm` action and then calls
`updateLine(id, { confirmed: true })`.

- `✓` is only available/painted while `confirmed === false` and `actions`
  includes `'confirm'`. After confirmation it disappears.
- `✕` follows the visibility rule below.
- Alerts ignore `confirmed` and `confirm`.

### 4. Quantity field `[ ]`

Always render a quantity field for **order** lines, including an empty
quantity: a visible, clickable segment with a sensible minimum width that
fires `editRequested({ field: 'quantity', ... })`. Alerts never get one.

### 5. Alert-line interactions and visual design `[ ]`

Reference: image 1 (blue dashed line, centred rounded box). Disregard its left
side and its trash icon: use `✕`.

- **No drag handle.** Drag anywhere along the horizontal line; hit area is the
  line plus **2 CSS px above and below**. Extend `_hitAt` (used by the
  capture-phase pointer handlers) with this band, and keep `hitTest()`
  consistent for the cursor (`ns-resize` on the band).
- Drag uses the existing machinery (scroll/scale disabled while held, restored
  on up/cancel, `priceChanged` on release).
- The `✕` control is **not visible until the line is hovered.** Needs hover
  tracking (`pointermove` on the container when not dragging; track hovered
  line id; `requestUpdate()` on change; clear on `pointerleave`). Keep it
  visible while the pointer is on the control and while dragging.
- Control placed at the **horizontal centre of the pane**.
- Rounded box (host `borderRadius`), chart-background fill, 1px border in the
  alert's `color`, literal `✕` inside; it **masks the horizontal line beneath**.
- No label/quantity space; image 1 is authoritative for the presentation.
- The `✕` click (without drag) fires `actionClicked({ action: 'cancel' })`.

### 6. Order-line interactions and visual design `[ ]`

Reference: image 2 (dash-dot line, round disk at left, tag with grip dots and
`1 | Sell limit`, dot at far right; ghost `SL` / `TP` tags are out of scope).

Layout, left to right, right-aligned in the pane:

`[ ✕ disk ] [ ✓ disk ] [ grip | quantity | separator | label ]`

- `✕` (round disk, literal `✕`) = cancel; `✓` (round disk, literal `✓`) =
  confirm. Both sit **left of** the `quantity | label` box.
- Visibility of `✕` / `✓`: shown while the order is **not confirmed**; once
  `confirmed`, shown only while the pointer is over the price line or the
  `quantity | label` box (use the same hover tracking as alerts; keep visible
  while the pointer is on the controls themselves). Hidden controls must not be
  hit-testable.
- **Dragging:** the **whole line and all controls** can start a price drag. A
  dedicated **grip box** at the left edge of the info box (dotted grip as in
  image 2) is the explicit affordance and shows `ns-resize`. Quantity / label /
  `✕` / `✓` still behave as buttons: click (no movement) → edit / action; drag
  (movement beyond the threshold) → move the price. No pointer-down side
  effects before the gesture is resolved.
- The line itself uses the same ±2 CSS px band as alerts for drag.
- **5rem** between the price-scale / y-axis edge and the order controls (right
  edge of the control group is 5rem from the pane's right edge). Resolve `rem`
  from the document root: `parseFloat(getComputedStyle(document.documentElement).fontSize)`
  (80 CSS px at 16px). Replaces the 8px margin.
- Info box = **quantity**, vertical **separator**, **label** (order type).
- Text and borders use the line `color`; backgrounds are the **chart
  background**, never a solid red/green fill.
- Every multi-part control has chart-background fill and a visible border, and
  must **mask the dashed line beneath it**.
- Cancel uses the literal `✕` glyph, not `x` or `×`.
- Image 2's pointed right tag edge and end dot: optional style cues, adopt only
  if cheap and record the decision here.

### 7. Styling options passed by the host `[ ]`

No hard-coded colours or fonts. Constructor options (static, no theme switching):

```ts
new InteractivePriceLines(container, {
  backgroundColor: '#040506',   // chart background, also given to createChart
  fontFamily: '...',            // host --sans, resolved
  borderRadius: 6,              // host --radius-sm, in CSS px
});
```

- All values are plain resolved strings/numbers. Canvas cannot evaluate
  `var(--x)`, so the host resolves tokens with
  `getComputedStyle(document.documentElement).getPropertyValue('--green').trim()`.
  Colours may use modern syntax such as `rgb(30 255 178)`; the plugin must treat
  them as opaque strings and never parse or concatenate alpha onto them.
- Remove all hard-coded fills (`#101014`, `#A71D31`, `#3C4048`, `#089981`,
  `#FFFFFF`) and the hard-coded font.
- Optional fallback only: derive the background from
  `chart.options().layout.background` when `ColorType.Solid`; explicit option
  wins.

### 8. Tests `[ ]`

No tests exist yet. Create them from scratch in this package, in
`tests/interactions` and `tests/graphics`. Minimum coverage: alert band hit
area, hover reveal of alert `✕`, centred alert control, empty quantity segment,
5rem offset, click-vs-drag threshold, grip / `✕` / `✓` / segment hit areas,
`✕` / `✓` visibility rules (unconfirmed vs confirmed), `lineType` immutability,
context-menu payload, drag restoring host scroll/scale options. Decide the test
runner with the user when this item starts (the repo's other plugins have no
usable reference yet).

## Host design tokens (demo must mirror these)

The host app passes colours resolved from these `:root` tokens. The demo
(`src/example`) should define the same tokens in `index.html` and resolve them
the way the host does, so the demo looks like the product.

```css
:root {
  --bg-0: #040506;  --bg-1: #0d0f12;  --bg-2: #14171b;
  --hairline: rgb(255 255 255 / 6%);  --hairline-strong: rgb(255 255 255 / 11%);
  --hover: rgb(255 255 255 / 4%);     --hover-strong: rgb(255 255 255 / 7%);
  --text-primary: #f3f5f8;  --text-secondary: #8e97a4;  --text-tertiary: #5a626d;
  --accent: #31f2af;  --accent-ink: #001b11;
  --accent-soft: rgb(19 165 115 / 14%);  --accent-soft-strong: rgb(19 165 115 / 28%);
  --green: rgb(30 255 178);  --green-soft: rgb(0 35 22);  --green-ink: #00170f;
  --red: rgb(255 77 100);    --red-soft: rgb(38 2 6);     --red-ink: rgb(93 9 19);
  --yellow: rgb(240 190 60);
  --orange: rgb(255 124 17); --orange-soft: rgb(49 22 0); --orange-ink: #2a1100;
  --sans: "Inter Variable", -apple-system, BlinkMacSystemFont, "SF Pro Text",
    "SF Pro Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "SF Mono", "Menlo", "Consolas", monospace;
  --radius-xs: 4px; --radius-sm: 6px; --radius-md: 8px; --radius-lg: 14px; --radius-pill: 999px;
  /* shadows, sidebar and app-margin tokens exist in the host but are irrelevant to the plugin */
}
```

Suggested demo mapping (demo only; the host decides real colours; confirm with
the user if anything should differ, there is no blue token):

| Use | Token |
| --- | --- |
| chart `backgroundColor` / `layout.background` | `--bg-0` |
| label / quantity text on controls | line colour (text uses the line colour, not `--text-primary`) |
| `DEMO_COLORS.alert` | `--yellow` |
| `DEMO_COLORS.buy` | `--green` |
| `DEMO_COLORS.sell` (stop loss) | `--red` |
| `DEMO_COLORS.trailing` | `--orange` |
| `DEMO_COLORS.sellLimit` | `--accent` |
| `fontFamily` | `--sans` |
| `borderRadius` | `--radius-sm` (6) |

## Demo fixtures (use in `src/example/example.ts`)

```ts
export const DEMO_LINES = [
  { id: 'alert', price: 102.5, color: DEMO_COLORS.alert, label: 'Alert', quantity: '', actions: ['cancel'], lineType: 'alert' },
  { id: 'buy-limit', price: 96.5, color: DEMO_COLORS.buy, label: 'Buy Limit', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: false },
  { id: 'buy-stop', price: 105, color: DEMO_COLORS.buy, label: 'Buy Stop', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: true },
  { id: 'sell-stop-loss', price: 94, color: DEMO_COLORS.sell, label: 'Stop Loss', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: true },
  { id: 'sell-trailing-stop', price: 91.5, color: DEMO_COLORS.trailing, label: 'Trailing Stop', quantity: '', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: false },
  { id: 'sell-limit', price: 108, color: DEMO_COLORS.sellLimit, label: 'Sell Limit', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: true },
];
```

This differs from the user's earlier fixtures (cancel-only, no `confirmed`) on
purpose so the demo exercises both visibility states and the empty-quantity
segment (`sell-trailing-stop`). Adjust if the user objects.

The demo should also: create the chart with `layout.background` = the same
background passed to the plugin; subscribe to `contextMenuRequested()` and show
a minimal host-owned menu (set target price, change colour, remove); on
`actionClicked` with `confirm`, simulate the host commit and call
`updateLine(id, { confirmed: true })`; on `cancel`, call `removeLine`; keep the
host-owned HTML editor flow for quantity / label edits.

## Important implementation notes

- `lineRects()` is the single geometry source shared by canvas drawing and
  `hitTest` / `_hitAt`; keep it that way so painted controls and pointer
  regions cannot drift apart. The line band, hover state and control
  visibility must also come from shared geometry/state.
- `priceToCoordinate()` can return `null`; never draw or hit-test such a line.
- Use device-pixel-ratio-aware `fancy-canvas` drawing
  (`useBitmapCoordinateSpace`) as the current renderer does. Keep 1px borders
  crisp (round to bitmap pixels, `+0.5` for odd widths).
- Masking: fill each control rect with the background colour *before* stroking
  its border and drawing text, on the same top-order layer as the line, so the
  line is hidden underneath. Check the canvas dashed line vs the native price
  line created by `addLine` are not visibly doubled.
- Gesture model (drag vs click) replaces the v1.0 pointer-down actions:
  pointer-down arms, pointer-move past the threshold starts the drag (then
  disable scroll/scale and `setPointerCapture`), pointer-up without drag fires
  the click action. Restore host `handleScroll` / `handleScale` on up/cancel
  exactly as v1.0 does.
- Canvas hit testing returns stable external IDs in the form
  `interactive-price-lines:<id>:<area>`. New areas (`grip`, `cancel`,
  `confirm`, `quantity`, `label`, `line`) to be listed here when final.
- Do not use a custom series. This remains a series primitive associated with
  the series whose price scale the levels use.
- Text widths are estimated in v1.0 (`length * 7.2 + 16`); prefer
  `ctx.measureText` with the host font so boxes fit, including `✕` / `✓`.
- `lineType` drives behaviour: `alert` → whole-line drag, centred hover `✕`, no
  labels; `order` → full control group.

## Repository state caution

Before this work, `pnpm-lock.yaml` was already modified. Installing workspace
dependencies was required after pnpm removed local links, and that operation
substantially rewrote the lockfile. Do **not** blindly reset it: compare it
with the intended branch / user changes first. The package source is untracked
and ready to add; build artifacts are ignored. A temporary pnpm cache was
moved outside the repository to
`/private/tmp/lightweight-charts-pnpm-store-20261122`.

## Starting a new chat: checklist for the assistant

1. Read this README, the attached source (`src/interactive-price-lines.ts`,
   `src/example/example.ts`) and the two reference images (alert: blue dashed
   line with centred `✕` box; order: round disk + grip/`qty | label` tag).
2. Work through the v1.1 checklist; the decisions log is binding. The only
   deferred item is context-menu `preventDefault` scope.
3. Deliver a **patch**, bump the version (`package.json` + `Version-X.Y.txt`),
   update this README, and give the `vX.Y: message` commit line.
