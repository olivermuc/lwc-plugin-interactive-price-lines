# Interactive price lines — handoff

`@tradingview/lwc-plugin-interactive-price-lines` is an experimental
Lightweight Charts™ series primitive for alerts and order levels. It extends
the ideas in `lwc-plugin-user-price-lines`, but adds draggable visual controls,
host-owned editing, and application actions.

This document is the current product and engineering handoff. **Read it fully
before making the next change.** Together with the source zip it must always be
enough to start a fresh chat and continue the work.

- **Last released plugin version: v1.2** (see "Current implementation").
- **Next target: v1.3**: the open items under "Open items" (tests, plus the points to confirm).

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
  message line). Done in v1.2 (`Version-1.2.txt`, `package.json` `1.2.0`).

## Repository and package

- Repository: `/Users/oliver/Code/lightweight-charts`
- Package: `packages/lwc-plugin-interactive-price-lines`
- Entry point: `src/interactive-price-lines.ts` (~620 lines, single file)
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

## Current implementation (v1.2)

`InteractivePriceLines` is a series primitive attached with:

```ts
const lines = new InteractivePriceLines(chartContainer, {
  backgroundColor: '#020305',   // optional; else chart layout.background (solid), else #020305
  fontFamily: '...',            // optional; default system stack
  borderRadius: 6,              // optional, CSS px
  alertIcon: '🗑',              // optional glyph of the alert box; '✕' is the plain alternative
});
series.attachPrimitive(lines);
```

The chart container is deliberately passed in. The public chart API does not
expose pointer-down / pointer-up subscriptions, so the primitive uses
capture-phase listeners (`pointerdown`, `pointermove`, `pointerup`,
`pointercancel`, `pointerleave`, `contextmenu`) on the supplied container.

Public methods:

- `addLine(options)` creates a tracked line and returns its public data. Also
  creates a native `series.createPriceLine` **with `lineVisible: false`**: the
  native line only supplies the axis label; the canvas draws the visible line
  (so controls can mask it and it is never doubled). Throws on duplicate id or
  if not attached.
- `updateLine(id, patch)` patches `price`, `color`, `fontColor`, `fontSize`,
  `quantity`, `label`, `actions`, `confirmed`. `lineType` is immutable (not in the patch type; a
  runtime `lineType` key throws). Throws on unknown id.
- `removeLine(id)`, `lines()`.
- `editRequested()`, `actionClicked()`, `priceChanged()`,
  `contextMenuRequested()` return toolkit subscriptions.

```ts
lines.editRequested().subscribe(({ line, field, anchor }) => { /* host editor at anchor (viewport px); commit via updateLine */ });
lines.actionClicked().subscribe(({ line, action }) => { /* 'cancel' → removeLine; 'confirm' → commit, then updateLine(id, { confirmed: true }) */ });
lines.priceChanged().subscribe(({ line, previousPrice }) => { /* fired on release with the final drag price */ });
lines.contextMenuRequested().subscribe(({ price, line, clientX, clientY }) => { /* host opens its own menu */ });
```

Types: `InteractivePriceLineAction = 'cancel' | 'confirm'`,
`InteractivePriceLineField = 'quantity' | 'label'`,
`InteractivePriceLineType = 'alert' | 'order' | 'holding'`,
`InteractivePriceLineOptions { id, price, lineType?='order', color?, fontColor?, fontSize?=12, quantity?, label?, actions?, confirmed?=false }`,
`InteractivePriceLinesOptions { backgroundColor?, fontFamily?, borderRadius?, alertIcon? }`.
The returned `InteractivePriceLine` carries the **resolved** `fontColor` and `fontSize`.

### Rendering / geometry (v1.2)

`layoutLine()` is the single geometry source for drawing and hit testing (CSS
px, pane coordinates). Hidden controls have no rect: not painted, not
hit-testable.

- **Colours (DECIDED):** background (option, else chart solid background, else
  `#020305`); line colour (`color`, default `#F23645`) for line, borders,
  separator and the `✕` / `✓` icons; **text colour** (quantity / label) =
  `fontColor`, else `color` **if one was passed**, else `TEXT_COLOR` (`#fff`).
  The fallback is live: `updateLine({ color })` also recolours text that has no
  explicit `fontColor`. Colours are opaque strings.
- **Font size:** `fontSize` per line (CSS px, default 12, must be > 0 or
  `addLine` / `updateLine` throw). Row height scales proportionally
  (`round(fontSize * 22 / 12)`, i.e. 22 at 12); disks are `rowHeight` wide.
  Paddings and gaps stay constant.
- **Info box margins (DECIDED v1.2):** `border | quantity | separator | label |
  border`. Every left / right margin (border to text, text to separator) is
  `TEXT_PADDING` = 8px; segment width = measured text + 2 × padding. Only an
  *empty* segment gets a minimum width (quantity 28, label 22). The old grip
  column is removed: the whole box is the drag area.
- **Order** (default): dash-dot line + small end dot; right edge of the info
  box is **5rem** from the pane's right edge (rem resolved from the root font
  size). Left to right: `[ ✕ disk ][ ✓ disk ][ quantity | label ]`. The info
  box never moves when `✕` / `✓` appear or disappear. The quantity segment is
  always present (also when empty).
- **Alert:** dashed line, no quantity / separator / label. A control box with
  **one icon only** (`alertIcon`, default `🗑`), vertically centred on the line
  and horizontally centred in the pane, **only while hovered / pressed**.
  Width = max(28, icon width + 2 × padding). Needs `'cancel'` in `actions`,
  otherwise the alert is just a draggable line. No outside buttons.
- **Holding** (new, for future use cases): the break-even style line. Dotted
  line, label-only box (`border | label | border`, same 5rem right offset), no
  quantity, no buttons, no end dot. **Fully static:** it is skipped by hit
  testing, hover, drag, click and the context-menu `line` payload (a right
  click on it reports `line: null`). The **host** owns the label text (abs and %
  distance to the current price) and must call `updateLine(id, { label })` (and
  `price` if it moves) when the numbers change.
- **`✕` / `✓` visibility (CHANGED v1.2, was "unconfirmed: always"):** order
  buttons only exist **while the line is hovered** (line band, info box, the
  row between the info box and the buttons, the buttons themselves, or while
  pressed / dragged). Unconfirmed: `✕` + `✓`; confirmed: `✕` only. `✕` needs
  `'cancel'`, `✓` needs `'confirm'` in `actions`. Alerts ignore `confirm` and
  `confirmed`; holdings ignore everything. Button slots are laid out even while
  hidden, so nothing shifts on hover; the hover region (`LineLayout.region`)
  covers the gaps, so the pointer can travel from the info box to the buttons.
- **Masking:** pass 1 draws all lines; pass 2 draws all controls (background
  fill, then 1px border), so every control hides every line beneath it.
- **Hit order:** controls of all interactive lines (last added first; `confirm,
  cancel, quantity, label`), then line bands. `hitTest()` external ids:
  `interactive-price-lines:<id>:<area>` with area ∈ `quantity | label | cancel
  | confirm | line` (`grip` was removed in v1.2). Cursor: `ns-resize` on `line`,
  `pointer` otherwise.
- **Gesture:** press on any hit arms (no side effects yet). Movement ≥ 4 CSS px
  starts a price drag from any area (grab offset kept, no jump). Release
  without that movement is a click: `quantity` / `label` → `editRequested`,
  `cancel` / `confirm` → `actionClicked`. `pointercancel` aborts and restores
  the original price. `handleScroll` / `handleScale` are disabled from the
  **press** (not only from the first move, so a touch pan cannot start before
  the threshold) and restored on up / cancel.
- **`pointerleave`:** only the container's own `pointerleave` clears hover
  (capture listeners also receive the non-bubbling `pointerleave` of every
  child element, which previously reset hover spuriously).
- **Context menu (DECIDED):** a right click anywhere inside the chart container
  always calls `preventDefault()` and fires `contextMenuRequested` with
  `price` (null outside the pane height, e.g. time axis), `line` (control or
  band hit, else null) and client coordinates. Any pending press is aborted.
- Style cues from image 2: dash-dot line and end dot adopted; the pointed
  right edge of the tag and the ghost `SL` / `TP` tags are **not** adopted.

### Verification so far

v1.1: typechecked against `lightweight-charts@5`, headless smoke test (fake
chart / pointer events).

v1.2 (done in the cloud sandbox, which had **no** `lightweight-charts`,
`pnpm install` or network): the plugin and the demo were typechecked with
`strict`, `noUnusedLocals` against hand-written stub typings, then run in
headless Chromium (devicePixelRatio 2) against a fake chart (linear price
scale, canvas, real pointer events) so that the **actual** demo code ran. Checked:
idle state shows no buttons; hover on an unconfirmed order shows `✕ ✓`,
a confirmed order only `✕`; hover survives the gaps between the box and the
buttons and between the two buttons, and ends when the pointer leaves; confirm
click fires `confirm` and drops `✓`; dragging an order fires `priceChanged`;
the holding line neither drags nor fires events and a right click on it gives
the "add alert" menu; alert hover shows the centred `🗑` box; `fontSize` 9 / 12 /
16 / 20 scale the rows; `fontColor` → `color` → `#fff` fallback; `fontSize: 0`
throws. **Not verified:** the real `lightweight-charts` rendering pipeline,
pixel match against images 1 and 2 on the real chart, and `🗑` glyph look on
macOS / Windows (colour emoji; set `alertIcon: '✕'` for a line-coloured glyph).

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
| Dragging | The **entire line and all controls** are draggable (orders, alerts). Holdings are static. No grip column since v1.2 |
| Click vs drag | Press arms; movement ≥ 4 CSS px starts a drag; release without it is a click. Actions and edits fire on pointer-up |
| `✓` confirm | Only confirm tells the host to commit the real order. Once confirmed `✓` is **removed** |
| `✕` / `✓` placement | Both left of the `quantity \| label` box |
| `✕` / `✓` visibility | **v1.2:** orders only, **hover only** for both. Unconfirmed: `✕` + `✓`; confirmed: `✕` only (user: buttons "always seem visible", hover ignored) |
| `lineType` | `'alert' \| 'order' \| 'holding'`, **immutable** after `addLine` |
| Background colour | Passed once to the plugin (or taken from the chart's solid background, else `#020305`); no theme switching |
| Colours | **No token handling in the plugin.** Background, line/icon colour (`color`), text colour (`fontColor` → `color` → `#fff`) |
| Info box margins | v1.2: `border \| quantity \| separator \| label \| border`, all side margins 8px; grip column removed |
| Alert style | v1.2: centred single-icon box (`🗑`, option `alertIcon`), no quantity / separator, hover only, no outside buttons |
| Holding | v1.2: static break-even line, label-only box, host keeps label (abs, %) current |
| Context menu | Right click anywhere on the chart: `preventDefault()` + `contextMenuRequested` event to the host, which owns the menu |
| Tests | Do not exist yet; create `tests/interactions` and `tests/graphics` from scratch (runner to be decided with the user) |

## Checklist (v1.2)

Status legend: `[ ]` open, `[x]` done. Update this list every drop.

1. Context menu event `[x]`
2. Explicit line type `[x]`
3. Order confirmation state `[x]`
4. Quantity field always rendered for orders `[x]`
5. Alert-line interactions and visual design `[x]` (redesigned v1.2)
6. Order-line interactions and visual design `[x]`
7. Styling options passed by the host `[x]` (`backgroundColor`, `fontFamily`, `borderRadius`, `alertIcon`; per line `fontColor`, `fontSize`)
8. Tests `[ ]`: **parked by the user for now.** When picked up, create them in
   `tests/interactions` and `tests/graphics`; decide the runner with the user.
   Minimum coverage: alert band hit area, hover reveal of the alert box,
   centred alert control, empty quantity segment, 5rem offset, equal info box
   margins, click-vs-drag threshold, `✕` / `✓` / segment hit areas, hover-only
   button visibility and hover surviving the gaps, `fontColor` fallback chain,
   `fontSize` validation, holding is static, `lineType` immutability,
   context-menu payload, drag restoring host scroll/scale options.
9. `fontColor` / `fontSize` per line `[x]`
10. Equal info box margins `[x]`
11. Buttons only on hover `[x]`
12. `holding` line type `[x]`
13. Alert box restyle (single icon, no separator) `[x]`

## Open items

- Item 8 (tests): parked by the user.
- **To confirm with the user (v1.2 interpretations, each is a small change):**
  1. *Hover rule.* v1.2 shows `✕` / `✓` **only on hover, also for unconfirmed
     orders** (the old "unconfirmed: always visible" decision is dropped).
     Revert = `hovered &&` in the two button conditions in `layoutLine()`.
  2. *Grip removed.* The user's margin spec lists no grip, so the grip column
     is gone and the whole box is the drag area. Re-adding it is a new segment
     in `layoutLine()` plus its hit area.
  3. *Alert box is hover-only* (as decided in v1.1), now with a `🗑` icon. If it
     should be permanently visible, remove the `hovered &&` in the alert branch.
  4. *Holding is fully inert*: not hit-testable, not in the context-menu
     payload. Say so if the host wants right click / hover on it.
  5. *Holding box position:* same 5rem right offset as orders, label only.
- Visual review of v1.2 in the real demo (`pnpm ... dev`): see "Verification so far" for what could not be checked in the sandbox.
- Known limitation (unchanged from v1.0): pointer coordinates are relative to
  the chart container and assume the pane starts at x = 0 (no left price scale).
- Hover-only buttons have no touch equivalent (no hover on touch); a tap on the
  line / box reveals them only while pressed.

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
| quantity / label text on controls | `fontColor` = `--text-primary` (plugin fallback chain: `fontColor` → `color` → `#fff`; icons, borders and separator use the line colour) |
| `DEMO_COLORS.holding` | `--text-secondary` |
| `DEMO_COLORS.alert` | `--yellow` |
| `DEMO_COLORS.buy` | `--green` |
| `DEMO_COLORS.sell` (stop loss) | `--red` |
| `DEMO_COLORS.trailing` | `--orange` |
| `DEMO_COLORS.sellLimit` | `--accent` |
| `fontFamily` | `--sans` |
| `borderRadius` | `--radius-sm` (6) |

## Demo fixtures (use in `src/example/example.ts`)

```ts
// FONT_COLOR = token('--text-primary'); holdingLabel() = `BE 97.80  +1.28 (+1.31%)` (abs and % vs current price)
export const DEMO_LINES = [
  { id: 'alert', price: 102.5, color: DEMO_COLORS.alert, fontColor: FONT_COLOR, label: 'Alert', quantity: '', actions: ['cancel'], lineType: 'alert' },
  { id: 'buy-limit', price: 96.5, color: DEMO_COLORS.buy, fontColor: FONT_COLOR, label: 'Buy Limit', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: false },
  { id: 'buy-stop', price: 105, color: DEMO_COLORS.buy, fontColor: FONT_COLOR, label: 'Buy Stop', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: true },
  { id: 'sell-stop-loss', price: 94, color: DEMO_COLORS.sell, fontColor: FONT_COLOR, label: 'Stop Loss', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: true },
  { id: 'sell-trailing-stop', price: 91.5, color: DEMO_COLORS.trailing, fontColor: FONT_COLOR, label: 'Trailing Stop', quantity: '', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: false },
  { id: 'sell-limit', price: 108, color: DEMO_COLORS.sellLimit, fontColor: FONT_COLOR, label: 'Sell Limit', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: true },
  { id: 'holding', price: 97.8, color: DEMO_COLORS.holding, fontColor: FONT_COLOR, label: holdingLabel(97.8), lineType: 'holding' },
];
```

This differs from the user's earlier fixtures (cancel-only, no `confirmed`) on
purpose so the demo exercises both button sets and the empty-quantity
segment (`sell-trailing-stop`). The `holding` fixture was added in v1.2.

The demo creates the chart with `layout.background` =
the same background passed to the plugin; shows a minimal host-owned context
menu (set target price, change colour, remove; on empty chart: add alert at the
clicked price); on `confirm` simulates the host commit via
`updateLine(id, { confirmed: true })`; on `cancel` calls `removeLine`; and keeps
the host-owned HTML editor for quantity / label edits.

## Important implementation notes

- `layoutLine()` is the single geometry source shared by canvas drawing and
  `hitTest` / `_hitAt`; keep it that way so painted controls and pointer
  regions cannot drift apart. Hover state and control visibility are inputs to
  it, never recomputed elsewhere.
- `priceToCoordinate()` can return `null`; never draw or hit-test such a line.
- Use device-pixel-ratio-aware `fancy-canvas` drawing
  (`useBitmapCoordinateSpace`). Borders are stroked inset by half an integer
  line width on snapped bitmap rects so they stay crisp.
- Do not use a custom series. This remains a series primitive associated with
  the series whose price scale the levels use.
- `lineType` drives behaviour: `alert` → whole-line drag, centred hover icon
  box, no labels; `order` → info box + hover buttons; `holding` → static
  label box.
- Layout constants (base row height 22 @ 12px font, text padding 8, gaps, min
  widths, 4px threshold, ±2px band, 5rem offset) are at the top of the source
  file.
- Generated `typings/` are build output; patches do not include them.

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
2. Work through the v1.2 checklist and the "To confirm" list under Open
   items; the decisions log is binding.
3. Deliver a **patch**, bump the version (`package.json` + `Version-X.Y.txt`),
   update this README, and give the `vX.Y: message` commit line.
