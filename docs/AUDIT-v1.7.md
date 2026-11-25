# Audit of v1.6 and what v1.7 changed

Scope: the plugin package `lwc-plugin-interactive-price-lines` v1.6 against the `create-lwc-plugin` template
(standards, packaging, licence, documentation) and a review of the source (comments, naming, ordering, canvas
practice). The two uploaded v1.6 zips were byte-identical.

**How it was checked.** By reading every file and comparing it with the template. The old and the new source were
typechecked (`strict`, `noUnusedLocals`) against hand-written stub typings; both pass. There was no network, so
`npm install`, the real `lightweight-charts` typings, `npm run build`, `publint`, `arethetypeswrong` and a browser
run were **not** possible. See "Not verified".

Legend: **fixed** = done in v1.7, **open** = recommendation, not applied.

## 1. Standards and packaging

| # | Finding | Status |
| - | ------- | ------ |
| 1.1 | Package name was scoped `@tradingview/...`. That scope is TradingView's; you cannot publish under it. | fixed: `lwc-plugin-interactive-price-lines` (check availability on npm) |
| 1.2 | `author`, `lwcPlugin.author` said `TradingView`; `lwcPlugin.origin` was `official`. | fixed: Oliver Seidel, `community` |
| 1.3 | `license: Apache-2.0` was declared but there was **no LICENSE file** and no copyright holder. | fixed, see section 2 |
| 1.4 | `workspace:*` dependencies (`lightweight-charts`, toolkit, preview-kit) only resolve inside the monorepo. | fixed: version ranges as in the template |
| 1.5 | `@tradingview/lwc-plugin-preview-kit` was a devDependency but nothing imports it. | fixed: removed |
| 1.6 | `compile.mjs` imported `../../scripts/plugins/compile-plugin.mjs` from the monorepo. | fixed: template `compile.mjs` for standalone projects |
| 1.7 | Exact pins (`vite 8.3.7`, `typescript 5.9.3`, `dts-bundle-generator 9.5.1`) instead of the template's ranges. | fixed: template ranges. If `vite 8.3.7` is a version you need, put it back |
| 1.8 | Missing `keywords`, `publishConfig`, `check-package` script, `publint`, `@arethetypeswrong/cli`. | fixed |
| 1.9 | `typings/` (build output) was inside the zip. | fixed: removed, `.gitignore` added |
| 1.10 | Missing `.gitignore`, root `index.html` redirect, `src/vite-env.d.ts`. | fixed (copied from the template) |
| 1.11 | `package.json` has no `repository`, `bugs`, `homepage`. | open: add your URL (`"repository": { "type": "git", "url": "git+https://github.com/<you>/<repo>.git" }`) |
| 1.12 | `exports`, `types`, `files`, `lwcPlugin.category/demo/tags`, `tsconfig.json`, `moduleResolution: Bundler`, ESM only, `fancy-canvas` as dependency. | already conform |
| 1.13 | One 1,300-line source file. The template separates options, pane view, pane renderer and data source. | open, see 3.7 |
| 1.14 | `lwcPlugin.lifecycle` is `experimental`. The template default is `current`. | left as is; change when you consider the API stable |
| 1.15 | `Version-1.6.txt` duplicates `package.json`. It is part of your workflow, so it was kept and renamed `Version-1.7.txt`. | kept |

## 2. Licence and attribution

- Chosen licence: **Apache-2.0**, copyright holder **Oliver Seidel**, 2026. It matches the template and the official
  plugins, covers your use case, and its `NOTICE` mechanism is the standard way to keep an author named. MIT would also
  work (shorter, no `NOTICE`, no patent clause); switching is three edits: `LICENSE`, `package.json`, the header.
- Where the author is named: `LICENSE` appendix, `NOTICE`, `package.json` (`author`, `lwcPlugin.author`), a header in
  each source file, `README.md`, and a banner comment that `compile.mjs` writes at the top of both built bundles
  (minification would otherwise strip the header).
- **What Apache-2.0 does and does not require.** Anyone may use the plugin free of charge, including commercially.
  Anyone who redistributes it must keep the licence, the copyright notice and the `NOTICE`. That is attribution in
  the package and its documentation. It does **not** force a visible mention inside an end user's application. If you
  want that, it is an extra condition on top of an open licence (or a different, non-open licence) and is worth a
  lawyer's look.
- **Third-party material to keep an eye on.** (a) The plugin README said it "extends the ideas" of the official
  `lwc-plugin-user-price-lines`. If any code was copied from it, the TradingView copyright notice has to stay on those
  parts. (b) `compile.mjs` is derived from the template (Apache-2.0, TradingView); that is acknowledged in `NOTICE`.
  (c) The standalone build inlines `fancy-canvas` and `@tradingview/lwc-toolkit`; check their licences and, if they
  require it, ship their notices (`THIRD-PARTY-NOTICES`). (d) Lightweight Charts™ has its own attribution
  requirement for pages that show a chart; the README points hosts to it. (e) "Lightweight Charts" is TradingView's
  trademark; the README states the plugin is independent.
- This is a technical review, not legal advice.

## 3. Source review

### Bugs and robustness

| # | Finding | Status |
| - | ------- | ------ |
| 3.1 | **Bold text overflowed its segment.** `Metrics.measure` took a `weight` argument but ignored it and measured the regular weight, while drawing used `fontWeightLabel` / `fontWeightValues` (the demo uses 600). | fixed |
| 3.2 | **Separators ignored `infoBoxLineWidth`** (always 1 px), contradicting the option's documentation and the v1.5 decision "border + separators". | fixed. Check `buy-stop` in the demo (width 2) |
| 3.3 | Horizontal line thickness used `horizontalPixelRatio`. | fixed: `verticalPixelRatio` |
| 3.4 | An invalid `lineType` (possible from untyped JS) passed validation and crashed while drawing (`DEFAULT_LINE_DASH[...]` undefined). `price` accepted `NaN`. | fixed: `checkLineType`, `checkPrice` |
| 3.5 | Every pointer move built the layout of all lines twice (`_hitAt`, then `_hoverAt`). | fixed: once |
| 3.6 | Allocation per move / per frame: `_metrics()` calls `getComputedStyle` and `chart.options()` each time, `_publicLine` copies every line each call, `lineDash` strings are re-parsed every frame. Fine for a handful of lines. | open: cache `remPx` (refresh on resize), parse `lineDash` in `addLine` / `updateLine`, build `_publicLine` objects once per frame |
| 3.7 | Single file. Proposed split, in the template's spirit: `types.ts` (public types), `constants.ts`, `validation.ts`, `layout.ts` (pure, no DOM, testable), `renderer.ts`, `pane-view.ts`, `interactive-price-lines.ts` (class). | open |
| 3.8 | Pointer coordinates come from the container's rectangle: wrong with a left price scale or a series in a pane other than the first. Documented as a limitation. | open: use the pane element's rectangle (`series.getPane().getHTMLElement()`, verify it exists in your `lightweight-charts` 5.x) |
| 3.9 | `showOrderValue` is hard-wired to `de-DE`. | open: add a `formatOrderValue` or `locale` option |
| 3.10 | `gesture.handleScroll as never` casts. | open: type the gesture fields as `ReturnType<IChartApi['options']>['handleScroll']` and drop the casts |
| 3.11 | Touch: `preventDefault` on `pointerdown` does not stop browser panning; `touch-action: none` on the container may be needed. Hover-only controls have no touch equivalent. | open: test on a real device |
| 3.12 | No tests. The layout function is pure, so it is an easy first target (list of cases in `docs/HANDOFF.md`, checklist item 8). | open |

### Canvas practice

Already good: `useBitmapCoordinateSpace` with both pixel ratios; rects snapped to whole device pixels; strokes
inset by half a pixel for crisp borders; `save` / `restore`; dash lengths scaled by the ratio; one cached off-screen
context for measuring; layout shared by drawing and hit testing; two-pass drawing so controls mask all lines;
listeners and pointer capture cleaned up on `detached`; stale gestures ended.

Changed: vertical ratio for horizontal strokes; magic numbers named (`GRIP_DOT_RADIUS`, `GRIP_DOT_SPACING`,
`SEPARATOR_INSET`); a redundant `fillStyle` assignment removed; statements split one per line in the renderer.
Optional: the toolkit's `positionsBox` / `positionsLine` helpers do the same snapping as the hand-written code.

### Comments, names, order

- Added the author / licence header, JSDoc on every public method and subscription, and fixed two comments that no
  longer matched the code (`type-only import`, separator width).
- Option, resolved-line and stored-line properties, the `addLine` literal, the `updateLine` validation and
  application blocks and `_publicLine` now share one order: identity, content, behaviour, price line, info box,
  text, icon. Constants are grouped under headings (layout, interaction, defaults, typography, colours).
- `m` became `metrics`, `seg` became `segment`, `h` / `v` became `hpr` / `vpr`, and short-lived names in the renderer
  were spelled out.
- Imports are `import type` where only types are used.
- Stale statements in the handoff notes were corrected: the order value is a separate segment, the hit band is
  3 px, the file is about 1,300 lines.
- **Layout is not fully normalised.** Many statements still share a line (`const a = ...; if (...) return;`). A hand
  rewrite of 1,300 lines would be an unreviewable diff, so run a formatter once: `npx prettier --write src
  --use-tabs --single-quote --print-width 140` and commit that as its own change.

## 4. Documentation added

`README.md` (install, usage, line types, every option, methods, events, limitations, licence), `CHANGELOG.md` (Keep a
Changelog), `LICENSE`, `NOTICE`, `docs/HANDOFF.md` (the old README, corrected), this file, `.editorconfig`.

## 5. Not verified

- No install, build, `check-package` or browser run. In particular the `banner` option in `compile.mjs` and the
  `~1.0.0` range of `@tradingview/lwc-toolkit` are untested; check that the published toolkit has the `delegate`
  sub-path used by the plugin. If it does not, copy the small `Delegate` class into the project.
- Look at the demo once: bold labels (`Buy Limit`, `Alert`), the width-2 order, and a non-integer zoom level.
- The `README` browser versions come from memory of MDN data; the claims about `roundRect` and `structuredClone` are worth a quick check.
