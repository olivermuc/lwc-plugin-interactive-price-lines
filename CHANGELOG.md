# Changelog

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Release `vX.Y` of the project notes is published as `X.Y.0`.

## 1.7.0

### Added

- Apache-2.0 `LICENSE`, `NOTICE`, a user-facing `README.md` and this changelog.
- Author and licence header in every source file, and a one-line banner in the built bundles so the
  attribution survives minification.
- Validation of `lineType` and `price` in `addLine` and `updateLine` (they now throw instead of
  failing later while drawing).
- `check-package` script (publint, arethetypeswrong), `.gitignore`, `.editorconfig`, `vite-env.d.ts`.

### Changed

- Package renamed from `@tradingview/lwc-plugin-interactive-price-lines` to
  `lwc-plugin-interactive-price-lines`, and marked as a `community` plugin by Oliver Seidel.
- The build no longer depends on the Lightweight Charts monorepo: `compile.mjs` is the standalone
  template script, and `workspace:*` dependencies became regular version ranges.
- Options, constants and `StoredLine` fields are grouped consistently (identity, content, behaviour,
  price line, info box, text, icon). The order of properties in the generated typings changed; their
  names and types did not.
- Source indentation is tabs, as in the plugin template. Clearer names in the renderer and layout code.
- The old handoff `README.md` moved to `docs/HANDOFF.md`.

### Fixed

- Text was measured with the regular weight but drawn with `fontWeightLabel` / `fontWeightValues`, so bold
  or semi-bold text could be wider than its segment. It is now measured with the weight it is drawn with.
- Separators between info-box segments ignored `infoBoxLineWidth` and were always 1 px wide.
- The thickness of the horizontal price line used the horizontal pixel ratio instead of the vertical one.
- One pointer move computed the layout of all lines twice; it is now computed once.

## 1.6.0

### Added

- `lineDash`: custom dash lengths separated by spaces or commas; an empty string draws a solid line.
  `updateLine` can change it, `undefined` restores the line-type default.

### Fixed

- `above` and `below` icon backdrops now cover the whole price-line stroke (they overlap it by half of
  `priceLineWidth`).

## 1.5.0

### Added

- `dragStarted()` event, fired once per drag before the line moves.
- `lineType: 'temporary'`: a controls-free placeholder line, set and removed by the host.
- `showOrderValue` (orders), `showHoldingValueColor` (holdings).
- `fontWeightLabel`, `fontWeightValues`, `infoBoxLineWidth`, `priceLineWidth`, per-line `backgroundColor`,
  and the icon options (`icon`, `iconSize`, `iconOffset`, `iconPosition`, padding, colour, background, weight).

### Fixed

- Scrolling, panning and clicking stopped working after a drag. `chart.options()` returns the live options
  object, so the saved `handleScroll` / `handleScale` values were overwritten by the lock; they are now
  deep-copied. Only the primary pointer starts a gesture, and a lost `pointerup` can no longer leave the
  locks on.

## 1.0.0 to 1.4.0

Initial development: draggable order and alert lines, `✕` / `✓` controls, order confirmation state,
holding lines with `extraData`, per-line `fontColor` / `fontSize`, host-owned editing and the
context-menu event. See `docs/HANDOFF.md` for the decisions behind them.
