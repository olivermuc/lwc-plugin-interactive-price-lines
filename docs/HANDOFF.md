# Interactive price lines — handoff

> v1.7: this file used to be the package `README.md`. The user-facing README is now `README.md` at the package
> root, release notes live in `CHANGELOG.md`, and the audit of v1.6 is in `docs/AUDIT-v1.7.md`. This file stays the
> engineering handoff and is not published to npm.

`lwc-plugin-interactive-price-lines` (author: Oliver Seidel, Apache-2.0) is an experimental
Lightweight Charts™ series primitive for alerts and order levels. It extends
the ideas in `lwc-plugin-user-price-lines`, but adds draggable visual controls,
host-owned editing, and application actions.

This document is the current product and engineering handoff. **Read it fully
before making the next change.** Together with the source zip it must always be
enough to start a fresh chat and continue the work.

- **Last released plugin version: v1.7** (see "Current implementation" and `CHANGELOG.md`).
- **Next target: v1.8**: the open items under "Open items" (tests, plus the points to confirm).

## GENERAL project notes (workflow rules, MUST follow)

1. `docs/HANDOFF.md` (this file) documents the last official plugin version; `README.md` (users) and `CHANGELOG.md` follow it.
   1. SOURCE CODE CHANGES: ALWAYS keep this file, `README.md` and `CHANGELOG.md` current with every version drop.
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
4. UPDATE `docs/HANDOFF.md` with every drop (version, status of the checklist below,
   new decisions), add the release to `CHANGELOG.md`, and touch `README.md` if the public API changed.
5. If more context is needed than the plugin package (e.g. the whole
   lightweight-charts source), ask the user; they will zip it up.

### Version bookkeeping (DECIDED)

`package.json` is the single source of truth for the version; there is no
version constant in the source.

- `package.json` uses semver, so release `vX.Y` is stored as `X.Y.0`
  (v1.1 → `"version": "1.1.0"`).
- Keep `Version-X.Y.txt` in sync on every drop: rename/replace it so the file
  name and its content match the new version (content: `vX.Y` plus the commit
  message line). Done in v1.3 (`Version-1.5.txt`, `package.json` `1.5.0`).

## Repository and package

- Repository: `/Users/oliver/Code/lightweight-charts`
- Package: `lwc-plugin-interactive-price-lines` (standalone project since v1.7; it was `packages/lwc-plugin-interactive-price-lines` in the Lightweight Charts monorepo)
- Entry point: `src/interactive-price-lines.ts` (~1300 lines, single file; see the audit for a proposed split)
- Demo: `src/example/example.ts` + `src/example/index.html`
- Reference implementation: `packages/lwc-plugin-user-price-lines`
- Interaction reference: the official `lwc-plugin-brushable-area-series`
  documentation; use it for gesture ownership, not for its custom-series
  architecture.

```sh
npm install
npm run build
npm run typecheck
npm run dev -- --host 127.0.0.1
```

Dependencies: peer `lightweight-charts ^5.0.0`, `fancy-canvas ~2.1.0`,
dev `@tradingview/lwc-toolkit` (`Delegate`, `PluginBase`, inlined into `dist` by the build).
Open point: confirm that the published toolkit version exposes the `delegate` sub-path (see the audit).

## Current implementation (v1.7)

`InteractivePriceLines` is a series primitive attached with:

```ts
const lines = new InteractivePriceLines(chartContainer, {
  backgroundColor: '#020305',   // optional; else chart layout.background (solid), else #020305
  fontFamily: '...',            // optional; default system stack
  borderRadius: 6,              // optional, CSS px
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
- `updateLine(id, patch)` patches `price`, `colorPriceLine`, `colorInfoBoxBorder`, `fontColor`, `fontSize`,
  `fontWeightLabel`, `fontWeightValues`, `infoBoxLineWidth`, `infoBoxPaddingH`, `infoBoxPaddingV`,
  `priceLineWidth`, `lineDash`, `backgroundColor`
  (`''` = back to the plugin / chart background), `icon`, `iconFontWeight`, `iconColor`, `iconBackground`, `iconPaddingH`, `iconPaddingV`,
  `iconPosition`, `iconSize`, `iconOffset`, `showOrderValue`, `showHoldingValueColor`,
  `quantity`, `label`, `actions`, `confirmed`, `extraData` (replaced as a whole). `lineType` is immutable (not in the patch type; a
  runtime `lineType` key throws). Throws on unknown id; an invalid value throws **before** anything is changed.
- `removeLine(id)`, `lines()`.
- `editRequested()`, `actionClicked()`, `priceChanged()`, `dragStarted()`,
  `contextMenuRequested()` return toolkit subscriptions.

```ts
lines.editRequested().subscribe(({ line, field, anchor }) => { /* host editor at anchor (viewport px); commit via updateLine */ });
lines.actionClicked().subscribe(({ line, action }) => { /* 'cancel' → removeLine; 'confirm' → commit, then updateLine(id, { confirmed: true }) */ });
lines.dragStarted().subscribe(({ line }) => { /* once per drag, when the press passes the 4px threshold; line.price is still the old price */ });
lines.priceChanged().subscribe(({ line, previousPrice }) => { /* fired on release with the final drag price */ });
lines.contextMenuRequested().subscribe(({ price, line, clientX, clientY }) => { /* host opens its own menu */ });
```

Types: `InteractivePriceLineAction = 'cancel' | 'confirm'`,
`InteractivePriceLineField = 'quantity' | 'label'`,
`InteractivePriceLineType = 'alert' | 'order' | 'holding' | 'temporary'`,
`InteractivePriceLineFontWeight = number | 'normal' | 'bold' | 'bolder' | 'lighter'`,
`InteractivePriceLineOptions { id, price, lineType?='order', colorPriceLine?, colorInfoBoxBorder?, fontColor?, fontSize?=12, fontWeightLabel?='normal', fontWeightValues?='normal', infoBoxLineWidth?=1, infoBoxPaddingH?=8, infoBoxPaddingV?=5, priceLineWidth?=1, lineDash?, backgroundColor?, icon?='', iconFontWeight?='normal', iconColor?, iconBackground?, iconPaddingH?=0, iconPaddingV?=0, iconPosition?='middle', iconSize?=20, iconOffset?=20, showOrderValue?=false, showHoldingValueColor?=false, quantity?, label?, actions?, confirmed?=false, extraData? }`,
`InteractivePriceLineDragStart { line }`,
`InteractivePriceLineExtraData { holdingAmount?, holdingAbsGain?, holdingRelGain? }` (`string | number`, drawn as passed),
`InteractivePriceLinesOptions { backgroundColor?, fontFamily?, borderRadius? }`.
The returned `InteractivePriceLine` carries the **resolved** colors, icon settings, `fontSize` and styling values (`backgroundColor` is as passed, `undefined` = plugin / chart background).

### v1.7 changes

Housekeeping and audit drop, see `CHANGELOG.md` and `docs/AUDIT-v1.7.md`. Behaviour changes: text is measured
with its drawn weight; separators use `infoBoxLineWidth` (as decided in v1.5); the horizontal line thickness uses the
vertical pixel ratio; `lineType` and `price` are validated.

### v1.6 additions

- **Icon alignment:** `above` and `below` backdrops overlap the price line by
  half of `priceLineWidth`, covering the full stroke.
- **`lineDash`** (CSS px): optional custom dash lengths separated by spaces or
  commas, e.g. `'10 4 2 4'` or `'10, 4, 2, 4'`. An empty string draws a solid
  line. If omitted, defaults remain dash-dot for orders and temporary lines,
  dashed for alerts, and dotted for holdings. Can be changed with `updateLine`;
  setting it to `undefined` restores the line-type default.

### v1.5 additions

- **Bug fix, scroll / pan / click dead after a drag (or click on a control):**
  `chart.options()` returns the chart's **live** options object and `applyOptions`
  merges into it in place, so the `handleScroll` / `handleScale` values "saved" at
  press were overwritten by the `false` lock and then "restored" as `false`. They
  are now deep-copied (`structuredClone`) at press. Hardening: only the primary
  pointer starts a gesture; a stale gesture (lost `pointerup`) is ended by the
  next press or by a mouse move with no button down, so the locks can never stay
  on. The reproduction (fake chart with live `options()`) and the fix are described
  under "Verification so far".
- **`dragStarted()`**: fires once per drag, when the press passes the 4px threshold
  and *before* the line moves (`line.price` is the price before the drag).
- **`lineType: 'temporary'`**: a dash-dot line by default, no box, no controls, no end dot,
  not hit-testable, no hover, no drag, no context-menu payload, never reported in
  events. Created with `addLine`, moved with `updateLine({ price })`, removed with
  `removeLine`: host only. Styling (`colorPriceLine`, `priceLineWidth`, `icon*`) applies;
  it keeps the native axis label with its price.
- **`showOrderValue`** (orders only): `% = (line price - last price) / |last price| * 100`,
  2 decimals, German format, explicit `+` for gains, e.g. `Stop Loss -2,23 %`,
  drawn as its own segment after the label, separated by a divider (so the box grows). "Last price" = `close` (OHLC) or `value` of the last bar of the
  series (`dataByIndex`, `series.data()` as fallback); nothing is shown while there
  is none (or it is 0). It is computed from `line.price` on every paint, so it
  updates live while dragging and when the series updates.
- **`fontWeightLabel` / `fontWeightValues`**: label = order / alert / holding label
  (holding: the `Owned:` part); values = quantity, order value and the holding
  amount / gains. A segment is drawn as consecutive *runs* (own weight each),
  centred as a group; widths are measured per run with the run's weight. Validated
  (`normal | bold | bolder | lighter | 1..1000`) because the canvas silently drops
  an invalid `font`.
- **`infoBoxLineWidth`** (CSS px, `>= 0`, 0 = no border): border and separators of
  the label & data box (order, alert, holding). The `✕` / `✓` disks keep 1px.
- **`priceLineWidth`** (CSS px, `> 0`): the line itself; the drag band grows with
  it (`max(3, width / 2)` px each side; `LINE_HIT_TOLERANCE` is 3).
- **`backgroundColor`** per line: fill of the box, the `✕` / `✓` disks and (by
  default) the icon backdrop. `iconBackground` overrides the icon backdrop.
- **`icon` / `iconSize` / `iconOffset` / `iconPosition`**: a character / emoji,
  drawn in `iconColor` (defaults to `colorPriceLine`) with `iconFontWeight`
  (defaults to `normal`; same validated values as `fontWeightValues`), `iconSize`
  CSS px (default 20), right-aligned
  with `iconOffset` CSS px (default 20) from the pane edge. `iconPosition` is
  `middle` (default), `above` or `below`; above / below overlap the price line
  by half its `priceLineWidth`, covering the full stroke. `iconPaddingH` and
  `iconPaddingV` add CSS px around
  the backdrop (both default 0). Not interactive (the line band underneath still
  drags).
- **Quantity hit area check:** for an order with `quantity: ''` the quantity segment
  is **not** zero width: it gets `MIN_QUANTITY_WIDTH` = 28px, is hit-testable
  (`...:<id>:quantity`) and a click fires `editRequested` with `field: 'quantity'`.
  This is by design (the empty segment is the place to enter a quantity). A host
  that has orders without quantity (e.g. trailing stop) must ignore
  `field: 'quantity'` itself. Alerts / holdings have no quantity segment at all.

### Rendering / geometry (v1.6)

`layoutLine()` is the single geometry source for drawing and hit testing (CSS
px, pane coordinates). Hidden controls have no rect: not painted, not
hit-testable.

- **Colours:** `colorPriceLine` (default `#F23645`) colours the price line,
  grip dots, buttons and icon. `colorInfoBoxBorder` colours the info-box border
  and separators; it defaults to `colorPriceLine` and follows it on update
  unless explicitly set. **Text colour** = `fontColor`, else an explicitly
  supplied `colorPriceLine`, else `TEXT_COLOR` (`#fff`).
- **Font size:** `fontSize` per line (CSS px, default 12, must be > 0 or
  `addLine` / `updateLine` throw). The base row height scales proportionally
  (`round(fontSize * 22 / 12)`); disks are `rowHeight` wide.
- **Info-box padding:** `infoBoxPaddingH` defaults to 8px on each side of the
  text (segment = measured text + 2 × padding). `infoBoxPaddingV` defaults to
  5px at the base font size and scales with `fontSize`; this preserves the
  existing default box height. Only an *empty* segment gets a minimum width
  (quantity 28, label 22).
- **Order** (default): dash-dot line + end dot (customizable with `lineDash`);
  right edge of the info box is
  **5rem** from the pane's right edge. Left to right:
  `[ ✕ disk ][ ✓ disk ][ grip | quantity | label ]`. The grip (18px, dots) is
  drag-only. The info box never moves when `✕` / `✓` appear or disappear. The
  quantity segment is always present.
- **Alert:** dashed line (customizable with `lineDash`), `label | ✕` box (no grip, no quantity, no outside
  buttons) centred horizontally in the pane and vertically on the line, shown
  **only while the line is hovered / pressed**. The label segment is a
  drag-only area (no edit request); the `✕` segment needs `'cancel'` in
  `actions`, otherwise the box is label only.
- **Holding:** dotted line (customizable with `lineDash`), no end dot, static box
  `label: holdingAmount | holdingAbsGain | holdingRelGain`, e.g.
  `Owned: 123 | +123,12 | +13,12 %` (label defaults to `Owned`; values come from
  `extraData`; without an amount the first segment is just the label; absent /
  empty gains are skipped together with their separator). Same 5rem right offset as orders. **Fully
  static:** skipped by hit testing, hover, drag, click and the context-menu
  `line` payload (right click reports `line: null`). The host formats the
  values and keeps them current with `updateLine(id, { extraData })`.
- **`✕` / `✓` visibility (DECIDED, order only):** unconfirmed → both always
  visible; confirmed → `✓` removed, `✕` only while hovered (line band, info
  box, the row between box and buttons, the buttons, or while pressed /
  dragged). `✕` needs `'cancel'`, `✓` needs `'confirm'` in `actions`. Alerts
  ignore `confirm` / `confirmed`; holdings ignore everything. Button slots are
  laid out even while hidden, so nothing shifts on hover, and the hover region
  (`LineLayout.region`) covers the gaps between box and buttons.
- **Masking:** pass 1 draws all lines; pass 2 draws all controls (background
  fill, then 1px border), so every control hides every line beneath it.
- **Hit order:** controls of all interactive lines (last added first; `confirm,
  cancel, quantity, label`), then line bands. `hitTest()` external ids:
  `interactive-price-lines:<id>:<area>` with area ∈ `grip | quantity | label |
  cancel | confirm | line`. Cursor: `ns-resize` on `grip` and `line`, `pointer`
  otherwise.
- **Gesture:** press on any hit arms (no side effects yet). Movement ≥ 4 CSS px
  starts a price drag from any area (grab offset kept, no jump). Release
  without that movement is a click: `quantity` / `label` → `editRequested`,
  `cancel` / `confirm` → `actionClicked`; `grip` → nothing. `pointercancel` aborts and restores
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

v1.5 (same sandbox limits: stub typings, no real `lightweight-charts`): plugin and
demo typechecked (`strict`, `noUnusedLocals`); headless Chromium (dpr 2) with a fake
chart whose `options()` is the live object and whose `applyOptions` merges in place.
v1.4 reproduced the bug (`handleScroll` all `false` after one drag, no pan after
it or after a plain click on a line); v1.5 pans before and after both. Also
checked: `dragStarted` once, after the threshold, before the move; live
`-11,00 %` / `-16,00 %` while dragging; `Buy Stop +5,00 %`; `temporary` inert (no
hit, no drag, `line: null` in the context menu); empty quantity = 28px hit area;
invalid styling values throw; screenshots of weights, widths, background, icons.
**Not verified:** the real library. That `options()` is live in
`lightweight-charts@5` is from memory, so confirm the fix in the demo.

v1.1: typechecked against `lightweight-charts@5`, headless smoke test.

v1.2 / v1.3 (cloud sandbox without `lightweight-charts`, `pnpm install` or
network): plugin and demo typechecked (`strict`, `noUnusedLocals`) against
hand-written stub typings, then run in headless Chromium (devicePixelRatio 2)
against a fake chart (linear price scale, canvas, real pointer events) so that
the **actual** demo code ran. Checked in v1.3: unconfirmed order shows `✕ ✓`
without hover; confirmed order shows only `✕` and only on hover, hover survives
the gaps; grip / box drag fires `priceChanged`; alert hover shows
`Alert | ✕`, dragging it by the label works and clicking `✕` fires `cancel`;
holding renders `Owned: 123 | +123,12 | +13,12 %`, is inert and a right click
on it gives the "add alert" menu; `fontSize` / `fontColor` fallbacks from v1.2.
**Not verified:** the real `lightweight-charts` pipeline and pixel match
against images 1 and 2.

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
| Dragging | The **entire line and all controls** are draggable (orders, alerts). Orders also have a grip column; alerts have none. Holdings are static |
| Click vs drag | Press arms; movement ≥ 4 CSS px starts a drag; release without it is a click. Actions and edits fire on pointer-up |
| `✓` confirm | Only confirm tells the host to commit the real order. Once confirmed `✓` is **removed** |
| `✕` / `✓` placement | Both left of the `quantity \| label` box |
| `✕` / `✓` visibility | Orders only. Unconfirmed: both always visible. Confirmed: `✓` gone, `✕` only on hover (v1.2 hover-only change **reverted** in v1.3 by the user) |
| `lineType` | `'alert' \| 'order' \| 'holding'`, **immutable** after `addLine` |
| Background colour | Passed once to the plugin (or taken from the chart's solid background, else `#020305`); no theme switching |
| Colours | **No token handling in the plugin.** Background, price-line/icon colour (`colorPriceLine`), info-box border/separator colour (`colorInfoBoxBorder` → `colorPriceLine`), text colour (`fontColor` → explicit `colorPriceLine` → `#fff`) |
| Info box margins | v1.2: every text has 8px left / right; empty segments get a minimum width. The order grip stays (user likes it) |
| Alert style | v1.3: centred `label \| ✕` box (label default `Alert` set by host), no grip / quantity, hover only, no outside buttons. Trashcan dropped |
| Holding | v1.3: static line, box `Owned: amount \| abs gain \| rel gain` from `extraData` (v1.4: amount joined to the label with `: `), host formats and updates the values |
| Temporary line | v1.5: `lineType: 'temporary'`, dash-dot line by default, host-only set / unset, no interaction, styling applies, axis label kept |
| Order value | v1.5: `showOrderValue`, orders only, `+/-0,00 %` vs last price of the series, inside the label segment, live while dragging |
| Units | `iconSize`, `iconOffset`, and icon padding are **CSS px** (like `fontSize`) |
| Line widths | v1.5: `infoBoxLineWidth` = box border + separators only; `priceLineWidth` = the line |
| Context menu | Right click anywhere on the chart: `preventDefault()` + `contextMenuRequested` event to the host, which owns the menu |
| Tests | Do not exist yet; create `tests/interactions` and `tests/graphics` from scratch (runner to be decided with the user) |

## Checklist (v1.7)

Status legend: `[ ]` open, `[x]` done. Update this list every drop.

1. Context menu event `[x]`
2. Explicit line type `[x]`
3. Order confirmation state `[x]`
4. Quantity field always rendered for orders `[x]`
5. Alert-line interactions and visual design `[x]` (redesigned v1.2)
6. Order-line interactions and visual design `[x]`
7. Styling options passed by the host `[x]` (`backgroundColor`, `fontFamily`, `borderRadius`; per line `fontColor`, `fontSize`)
8. Tests `[ ]`: **parked by the user for now.** When picked up, create them in
   `tests/interactions` and `tests/graphics`; decide the runner with the user.
   Minimum coverage: alert band hit area, hover reveal of the alert box,
   centred alert control, empty quantity segment, 5rem offset, equal info box
   margins, click-vs-drag threshold, `✕` / `✓` / segment hit areas, hover-only
   button visibility and hover surviving the gaps, `fontColor` fallback chain,
   `fontSize` validation, holding is static, `lineType` immutability,
   context-menu payload, drag restoring host scroll/scale options.
9. `fontColor` / `fontSize` per line `[x]`
10. Equal text margins `[x]`
11. Hover rule: unconfirmed always visible (v1.2 change reverted) `[x]`
12. `holding` line type `[x]`
13. Alert box `label | ✕` `[x]`
14. `extraData` (`holdingAmount`, `holdingAbsGain`, `holdingRelGain`) `[x]`
15. Holding format `Owned: amount | abs | rel` `[x]`
16. Bug: scroll / pan / click dead after a drag or after adding a line `[x]` (live `options()` object, see v1.5 additions; confirm in the real demo)
17. `dragStarted()` event `[x]`
18. `lineType: 'temporary'` `[x]`
19. `showOrderValue` `[x]`
20. `fontWeightLabel`, `fontWeightValues` `[x]`
21. `infoBoxLineWidth`, `priceLineWidth` `[x]`
22. per-line `backgroundColor` `[x]`
23. `icon`, `iconSize`, `iconOffset` `[x]`
24. Check: empty `quantity` hit area `[x]` (not zero width; 28px, by design)
25. `lineDash` custom patterns and per-line-type defaults `[x]`
26. `above` / `below` icon backdrop alignment includes `priceLineWidth` `[x]`
27. v1.7 audit: licence, NOTICE, README, CHANGELOG, author header, standalone build `[x]`; remaining recommendations are listed in `docs/AUDIT-v1.7.md` `[ ]`

## Open items

- Item 8 (tests): parked by the user.
- **To confirm with the user (v1.3 interpretations):**
  1. *Alert box is hover-only* (v1.1 decision), now `Alert | ✕`. If it should
     be permanently visible, drop the `if (!hovered) return ...` line in the
     alert branch of `layoutLine()`.
  2. *Holding is fully inert*: not hit-testable, not in the context-menu payload.
  3. *`extraData` values are drawn as passed* (no number formatting, no sign
     colouring); the `%` sign is part of the string the host sends.
- **To confirm with the user (v1.5 interpretations):**
  1. *`pt` vs px:* `iconSize` / `iconOffset` are CSS px (default 20), consistent with `fontSize`. If real points are meant, multiply by 4/3.
  2. *`temporary` keeps the native axis label* (price on the axis). Set `axisLabelVisible: false` in `addLine` for it if not wanted.
  3. *`infoBoxLineWidth` does not touch the `✕` / `✓` disks* (they stay 1px).
  4. *`showOrderValue` is orders only* (not alerts) and the "current price" is the last bar of the series. If the host knows a better live price, add an option for it.
  5. *Box width jitter:* the value changes the box width while dragging (proportional font, `-9,99 %` to `-10,00 %`). If it bothers, reserve a fixed width for the value.
  6. *Drag start payload* is just `{ line }`; add `area` if the host needs to know what was grabbed.
- Visual review of v1.5 in the real demo (`pnpm ... dev`): see "Verification so far" for what could not be checked in the sandbox.
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
| quantity / label text on controls | `fontColor` = `--text-primary` (plugin fallback chain: `fontColor` → explicit `colorPriceLine` → `#fff`) |
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
// v1.5: STYLE = { fontColor: FONT_COLOR, fontWeightLabel: 600, fontWeightValues: 'normal' } is spread into every fixture below; the demo also sets
// showOrderValue on the buy / stop-loss / sell-limit orders, icons ('🔔', '⛔'), priceLineWidth / infoBoxLineWidth 2 on buy-stop, a backgroundColor on sell-limit,
// and the context menu on an empty chart can set / remove a `temporary` line.
// FONT_COLOR = token('--text-primary'); HOLDING_EXTRA = { holdingAmount: '123', holdingAbsGain: '+123,12', holdingRelGain: '+13,12 %' }
export const DEMO_LINES = [
  { id: 'alert', price: 102.5, colorPriceLine: DEMO_COLORS.alert, fontColor: FONT_COLOR, label: 'Alert', quantity: '', actions: ['cancel'], lineType: 'alert' },
  { id: 'buy-limit', price: 96.5, colorPriceLine: DEMO_COLORS.buy, fontColor: FONT_COLOR, label: 'Buy Limit', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: false },
  { id: 'buy-stop', price: 105, colorPriceLine: DEMO_COLORS.buy, fontColor: FONT_COLOR, label: 'Buy Stop', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: true },
  { id: 'sell-stop-loss', price: 94, colorPriceLine: DEMO_COLORS.sell, fontColor: FONT_COLOR, label: 'Stop Loss', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: true },
  { id: 'sell-trailing-stop', price: 91.5, colorPriceLine: DEMO_COLORS.trailing, fontColor: FONT_COLOR, label: 'Trailing Stop', quantity: '', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: false },
  { id: 'sell-limit', price: 108, colorPriceLine: DEMO_COLORS.sellLimit, fontColor: FONT_COLOR, label: 'Sell Limit', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: true },
  { id: 'holding', price: 97.8, colorPriceLine: DEMO_COLORS.holding, fontColor: FONT_COLOR, label: 'Owned', extraData: HOLDING_EXTRA, lineType: 'holding' },
];
```

This differs from the user's earlier fixtures (cancel-only, no `confirmed`) on
purpose so the demo exercises both button sets and the empty-quantity
segment (`sell-trailing-stop`). The `holding` fixture was added in v1.2 and uses `extraData` since v1.3.

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
  multi-segment box; `temporary` → bare line.
- Never keep a reference to `chart.options()` values across an `applyOptions`
  call: it is a live object. Copy with `structuredClone` first (v1.5 bug).
- Layout constants (base row height 22 @ 12px font, text padding 8, gaps, min
  widths, 4px threshold, ±3px band, 5rem offset) are at the top of the source
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
