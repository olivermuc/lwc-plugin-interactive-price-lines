# Interactive price lines

Draggable, annotated price lines for [Lightweight Charts™](https://github.com/tradingview/lightweight-charts):
order levels with quantity, label and `✕` / `✓` buttons, alerts, read-only holdings and temporary markers.
The plugin renders, hit-tests and drags on the chart canvas and reports what happened as events. Editing
popups, context menus and business actions (cancel, confirm, submit) stay with your application.

> This is an independent community plugin. It is not affiliated with, sponsored or endorsed by TradingView, Inc.
> Lightweight Charts™ is a trademark of TradingView, Inc.

**Status: experimental.** The API may still change in minor versions; see the [changelog](CHANGELOG.md).

## Features

- Four line types: `order`, `alert`, `holding` and `temporary`.
- Drag a line (or its grip) to change its price; a click on a segment or button raises an event instead.
- Optional distance to the last price on orders (`showOrderValue`), gain colouring on holdings.
- Per-line styling: colours, fonts and weights, line width and dash pattern, padding, background, icon.
- A right-click event that carries the clicked price and line, so the host can open its own menu.
- Crisp rendering at any device pixel ratio.

## Installation

### npm

Install the package. It requires `lightweight-charts` `^5.0.0` in your project:

```shell
npm install lwc-plugin-interactive-price-lines
```

Then import the plugin and attach it to a series:

```js
import { createChart, LineSeries } from 'lightweight-charts';
import { InteractivePriceLines } from 'lwc-plugin-interactive-price-lines';

const container = document.getElementById('chart');
const chart = createChart(container, { autoSize: true });
const series = chart.addSeries(LineSeries);
series.setData(data);

const lines = new InteractivePriceLines(container);
series.attachPrimitive(lines);
```

### CDN

The plugin is published as ES modules. Map the library and the plugin to their CDN builds with an import map:

```html
<script type="importmap">
{
  "imports": {
    "lightweight-charts": "https://unpkg.com/lightweight-charts@^5/dist/lightweight-charts.standalone.production.mjs",
    "lwc-plugin-interactive-price-lines": "https://unpkg.com/lwc-plugin-interactive-price-lines/dist/interactive-price-lines.standalone.js"
  }
}
</script>
```

The plugin can then be imported by name, exactly as it is under a bundler.

## Usage

The constructor takes **the chart container element**, not the chart. Lightweight Charts does not expose pointer
down / up subscriptions, so the plugin listens on that element (capture phase) for drag gestures and clicks.

```js
const lines = new InteractivePriceLines(container, {
  backgroundColor: '#020305', // optional; else the chart's solid layout.background, else #020305
  fontFamily: 'Inter, sans-serif', // optional
  borderRadius: 6, // optional, CSS px
});
series.attachPrimitive(lines);

// An order. The plugin never commits anything: it only tells you what the user did.
lines.addLine({
  id: 'buy-limit',
  price: 96.5,
  lineType: 'order',
  label: 'Buy Limit',
  quantity: '4',
  actions: ['cancel', 'confirm'],
  colorPriceLine: '#089981',
  showOrderValue: true,
});

lines.priceChanged().subscribe(({ line, previousPrice }) => {
  // fired on release with the final price
});
lines.actionClicked().subscribe(({ line, action }) => {
  if (action === 'cancel') lines.removeLine(line.id);
  else lines.updateLine(line.id, { confirmed: true }); // after your backend accepted the order
});
lines.editRequested().subscribe(({ line, field, anchor }) => {
  // open your own editor at `anchor` (viewport px), then lines.updateLine(line.id, { [field]: value })
});
lines.contextMenuRequested().subscribe(({ price, line, clientX, clientY }) => {
  // open your own menu; `line` is null when the click was not on a line
});
```

The example page (`npm run dev`) shows all line types together with a host-owned editor and context menu.

### Line types

`lineType` is set when the line is created and cannot be changed afterwards.

| Type | Looks like | Interaction |
| ---- | ---------- | ----------- |
| `order` | Dash-dot line with an end dot and a `grip \| quantity \| label` box. `✕` and `✓` buttons sit to the left of the box. | Drag anywhere on the line or box. Click quantity / label to request an edit, click a button to raise an action. |
| `alert` | Dashed line. A centred `label \| ✕` box appears while the line is hovered. | Drag the line or the box. `✕` needs `'cancel'` in `actions`. |
| `holding` | Dotted line with a static `Owned: amount \| absolute gain \| relative gain` box. | None: not draggable, no events, not part of the context-menu payload. |
| `temporary` | Dash-dot line, no box, no controls. | None. Created, moved (`updateLine`) and removed (`removeLine`) by the host only. |

Buttons on an `order`: while `confirmed` is `false`, `✕` and `✓` are always visible; once confirmed, `✓` is removed
and `✕` shows only while the order is hovered. `✕` needs `'cancel'`, `✓` needs `'confirm'` in `actions`.

## Options

### Plugin options (constructor)

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `backgroundColor` | `string` | chart background, else `#020305` | Colour used to mask the line beneath boxes and buttons. |
| `fontFamily` | `string` | system sans-serif stack | CSS font-family list for all control text. |
| `borderRadius` | `number` | `6` | Corner radius of boxes, in CSS px. |

The plugin does not read CSS variables (a canvas cannot evaluate `var(--x)`) and does not switch themes: pass
resolved colour strings and update lines with `updateLine` when your theme changes.

### Line options (`addLine`, `updateLine`)

All lengths are CSS px. Colours are opaque strings handed to the canvas as they are.

**Identity and position**

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `id` | `string` | required | Your identifier. Must be unique; not accepted by `updateLine`. |
| `price` | `number` | required | Price level. Must be finite. |
| `lineType` | `'order' \| 'alert' \| 'holding' \| 'temporary'` | `'order'` | Immutable. |

**Content**

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `quantity` | `string` | `''` | Orders only. An empty quantity still has a 28 px segment to click. |
| `label` | `string` | `'Price line'` (`'Owned'` for holdings) | Orders, alerts and holdings. |
| `extraData` | `{ holdingAmount?, holdingAbsGain?, holdingRelGain? }` | `{}` | Holdings: display strings (or numbers) drawn as passed. Replaced as a whole by `updateLine`. |

**Behaviour and state**

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `actions` | `('cancel' \| 'confirm')[]` | `[]` | Buttons to show. Alerts only use `cancel`; holdings ignore it. |
| `confirmed` | `boolean` | `false` | Orders. Set it with `updateLine` after your backend committed the order. |
| `showOrderValue` | `boolean` | `false` | Orders. Appends the distance to the last price, e.g. `-2,23 %`. |
| `showHoldingValueColor` | `boolean` | `false` | Holdings. Green for non-negative, red for negative gains. |

**Price line**

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `colorPriceLine` | `string` | `#F23645` | Line, grip, button and icon colour. |
| `priceLineWidth` | `number` | `1` | Must be greater than 0. |
| `lineDash` | `string` | per line type | Dash lengths separated by spaces or commas, e.g. `'10 4 2 4'`. `''` draws a solid line; `undefined` restores the default. |

**Info box**

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `backgroundColor` | `string` | plugin / chart background | Fill of the box, buttons and icon backdrop. `''` restores the default. |
| `colorInfoBoxBorder` | `string` | `colorPriceLine` | Border and separator colour. |
| `infoBoxLineWidth` | `number` | `1` | Border and separator width. `0` removes the border. The `✕` / `✓` buttons keep 1 px. |
| `infoBoxPaddingH` | `number` | `8` | Space between text and segment edges. |
| `infoBoxPaddingV` | `number` | `5` | At 12 px font size; scales with `fontSize`. |

**Text**

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `fontColor` | `string` | `colorPriceLine` if given, else `#fff` | Quantity / label text. |
| `fontSize` | `number` | `12` | Row height scales with it. Must be greater than 0. |
| `fontWeightLabel` | `number \| 'normal' \| 'bold' \| 'bolder' \| 'lighter'` | `'normal'` | Label weight. Numbers must be 1 to 1000. |
| `fontWeightValues` | same | `'normal'` | Quantity, order value and holding values. |

**Icon**

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `icon` | `string` | none | An emoji or character drawn right of the line. |
| `iconPosition` | `'middle' \| 'above' \| 'below'` | `'middle'` | Relative to the line. |
| `iconSize` | `number` | `20` | Must be greater than 0. |
| `iconOffset` | `number` | `20` | Gap to the right edge of the pane. |
| `iconPaddingH`, `iconPaddingV` | `number` | `0` | Padding around the icon backdrop. |
| `iconColor` | `string` | `colorPriceLine` | |
| `iconBackground` | `string` | line background | Fill behind the icon. `''` restores the default. |
| `iconFontWeight` | same as `fontWeightValues` | `'normal'` | |

Invalid values throw an `Error` whose message starts with `InteractivePriceLines:`. `updateLine` validates the
whole patch first, so a rejected patch changes nothing.

### Methods

| Method | Description |
| ------ | ----------- |
| `addLine(options)` | Creates a line and returns it with every default resolved. Throws on a duplicate `id`, an invalid option, or if the plugin is not attached. |
| `updateLine(id, patch)` | Patches a line (everything except `id` and `lineType`) and returns it. |
| `removeLine(id)` | Removes a line. Returns `false` for an unknown id. |
| `lines()` | Snapshot of all lines. |

### Events

| Subscription | Payload | Fired when |
| ------------ | ------- | ---------- |
| `editRequested()` | `{ line, field: 'quantity' \| 'label', anchor }` | A quantity or label segment is clicked. `anchor` is a viewport rectangle for positioning your editor. |
| `actionClicked()` | `{ line, action: 'cancel' \| 'confirm' }` | A button is clicked. |
| `dragStarted()` | `{ line }` | A press moved more than 4 px; once per drag, before the line moves (`line.price` is still the old price). |
| `priceChanged()` | `{ line, previousPrice }` | A drag was released with a different price. |
| `contextMenuRequested()` | `{ price, line, clientX, clientY }` | Right click anywhere on the chart. The browser menu is suppressed. `price` is `null` outside the pane, `line` is `null` unless a line was hit (never a holding). |

Subscriptions are `ISubscription` objects from `@tradingview/lwc-toolkit` (`subscribe`, `unsubscribe`, `unsubscribeAll`).

The full typed surface is published with the package in `dist/interactive-price-lines.d.ts`.

## Notes and limitations

- **Supported layout:** the series should live in the first pane, and the chart should have no left price scale. Pointer
  coordinates are taken relative to the container you pass in.
- **Autoscale:** lines never influence the visible price range. A line outside the visible range is not drawn.
- **Number format:** `showOrderValue` uses German formatting (`-2,23 %`). Holding values are drawn exactly as you pass them.
- **Accessibility:** everything is drawn on a canvas. There is no keyboard or screen-reader support in the plugin;
  your application should offer an accessible way to do the same things.
- **Touch:** the `✕` button of a confirmed order and the box of an alert appear on hover, which touch screens do not have.
- **Browsers:** needs `CanvasRenderingContext2D.roundRect` (Chrome / Edge 99, Safari 16, Firefox 112) and `structuredClone`.
- **Scroll and zoom during a drag:** while a line is pressed the plugin switches `handleScroll` and `handleScale` off and
  restores the previous values on release, so avoid changing those two options during a drag.

## Development

```shell
npm install
npm run dev
```

Open `localhost:5173`. The example in `src/example/` is the live preview; keep it filling the window.

```shell
npm run build           # dist/: entry point, standalone CDN build and bundled typings
npm run typecheck
npm run check-package   # publint + arethetypeswrong, run after a build
```

Project notes for contributors and AI assistants are in [`docs/HANDOFF.md`](docs/HANDOFF.md). Release history is
in [`CHANGELOG.md`](CHANGELOG.md).

## License and attribution

Copyright 2026 Oliver Seidel. Licensed under the [Apache License, Version 2.0](LICENSE).

You may use, modify and redistribute this plugin, including commercially, free of charge. The condition that matters
here is attribution: keep the copyright notice and the [`NOTICE`](NOTICE) file with any redistribution, in source or in
built form (the bundled files carry a one-line banner for this purpose).

Lightweight Charts™ has its own attribution requirement for pages that display a chart; see the `NOTICE` file of
`lightweight-charts`. It applies to your application separately from this plugin.
