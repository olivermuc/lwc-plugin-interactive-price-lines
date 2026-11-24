import { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  IPriceLine,
  ISeriesApi,
  MismatchDirection,
  PrimitiveHoveredItem,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import { Delegate, ISubscription } from '@tradingview/lwc-toolkit/delegate';
import { PluginBase } from '@tradingview/lwc-toolkit/plugin-base';

export type InteractivePriceLineAction = 'cancel' | 'confirm';
export type InteractivePriceLineField = 'quantity' | 'label';
export type InteractivePriceLineIconPosition = 'middle' | 'above' | 'below';
/**
 * Immutable after `addLine`.
 * - `order`: draggable, `grip | quantity | label` box, outside `✕` / `✓` buttons.
 * - `alert`: draggable, centred `label | ✕` box (on hover), no quantity, no grip, no outside buttons.
 * - `holding`: static line with an `Owned | amount | abs gain | rel gain` box. No drag, no controls, no events.
 * - `temporary`: a plain solid line without any controls, box or events. Set (`addLine`) and unset
 *   (`removeLine`) only programmatically, to be used as a temporary placeholder. Styling options apply.
 */
export type InteractivePriceLineType = 'alert' | 'order' | 'holding' | 'temporary';
/** CSS `font-weight`: a keyword (`normal`, `bold`, `bolder`, `lighter`) or a number from 1 to 1000. */
export type InteractivePriceLineFontWeight = number | 'normal' | 'bold' | 'bolder' | 'lighter';

/** Static styling, resolved by the host (canvas cannot evaluate `var(--x)`). No theme switching. */
export interface InteractivePriceLinesOptions {
  /** Chart background. Fallback: the chart's solid `layout.background`, else `#020305`. */
  backgroundColor?: string;
  /** CSS font-family list used for all control text. */
  fontFamily?: string;
  /** Corner radius of control boxes, in CSS px. Default 6. */
  borderRadius?: number;
}

/** Additional, line type specific data. Values are display strings formatted by the host (drawn as is). */
export interface InteractivePriceLineExtraData {
  /** `holding`: amount owned, e.g. `123`. */
  holdingAmount?: string | number;
  /** `holding`: absolute gain, e.g. `+123,12`. */
  holdingAbsGain?: string | number;
  /** `holding`: relative gain, e.g. `+13,12 %`. */
  holdingRelGain?: string | number;
}

/** Input used to create a line. `id` belongs to the host application's domain. */
export interface InteractivePriceLineOptions {
  id: string;
  price: number;
  /** Default `'order'`. Immutable: not accepted by `updateLine`. */
  lineType?: InteractivePriceLineType;
  /** Price-line, button and icon colour. Opaque string, never parsed. Defaults to `#F23645`. */
  colorPriceLine?: string;
  /** Info-box border and separator colour. Defaults to `colorPriceLine`. */
  colorInfoBoxBorder?: string;
  /** Colour of the quantity / label text. Fallback: `colorPriceLine`, else `#fff`. */
  fontColor?: string;
  /** Size of the control text in CSS px. The row height scales with it. Default 12. */
  fontSize?: number;
  /** Font weight of the order / alert / holding label. Default `'normal'`. */
  fontWeightLabel?: InteractivePriceLineFontWeight;
  /** Font weight of the data: quantity, order value (`-2,23 %`) and the holding values. Default `'normal'`. */
  fontWeightValues?: InteractivePriceLineFontWeight;
  /** Width of the border (and separators) of the label & data box in CSS px. Default 1. */
  infoBoxLineWidth?: number;
  /** Horizontal padding between text and info-box segment edges, in CSS px. Default 8. */
  infoBoxPaddingH?: number;
  /** Vertical padding inside info boxes, in CSS px at the base font size; scales with `fontSize`. Default 5. */
  infoBoxPaddingV?: number;
  /** Width of the price line in CSS px. Default 1. */
  priceLineWidth?: number;
  /** Fill of the label & data box, the buttons and the icon backdrop. Default: the plugin / chart background. */
  backgroundColor?: string;
  /** An emoji or character drawn on the right side of the price line. Default: none. */
  icon?: string;
  /** Font weight of a text icon. Uses the same values as `fontWeightValues`. Default `'normal'`. */
  iconFontWeight?: InteractivePriceLineFontWeight;
  /** Icon text colour. Defaults to `colorPriceLine`. */
  iconColor?: string;
  /** Fill behind the icon; defaults to the line's background or chart background. */
  iconBackground?: string;
  /** Horizontal padding around the icon backdrop, in CSS px. Default 0. */
  iconPaddingH?: number;
  /** Vertical padding around the icon backdrop, in CSS px. Default 0. */
  iconPaddingV?: number;
  /** Position relative to the price line; `above` and `below` align the backdrop edge to the line. Default `middle`. */
  iconPosition?: InteractivePriceLineIconPosition;
  /** Icon size in CSS px. Default 20. */
  iconSize?: number;
  /** Gap between the right edge of the pane (price axis) and the icon backdrop, in CSS px. Default 20. */
  iconOffset?: number;
  /**
   * Orders only. Shows the distance between the last price of the series and the line price directly after
   * the label, e.g. `Stop Loss -2,23 %` (2 decimals, German format). Updates live while dragging. Default `false`.
   */
  showOrderValue?: boolean;
  /** Holdings only. Colors absolute and relative gains green when non-negative and red when negative. Default `false`. */
  showHoldingValueColor?: boolean;
  /** Orders only; ignored by the other types. */
  quantity?: string;
  /** Orders, alerts and holdings (a holding defaults to `Owned`). */
  label?: string;
  /** Orders (`cancel`, `confirm`) and alerts (`cancel`). Ignored by `holding`. */
  actions?: readonly InteractivePriceLineAction[];
  /** Orders only. Set by the host (via `updateLine`) after it committed the order. Default `false`. */
  confirmed?: boolean;
  /** Line type specific data; `holding` draws the present values after its label, in the order amount, abs gain, rel gain. */
  extraData?: InteractivePriceLineExtraData;
}

/** A rectangle in viewport coordinates, for positioning a host-owned editor. */
export interface InteractivePriceLineAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InteractivePriceLine {
  id: string;
  price: number;
  lineType: InteractivePriceLineType;
  colorPriceLine: string;
  colorInfoBoxBorder: string;
  /** Resolved: the explicit `fontColor`, else `colorPriceLine` if one was passed, else `#fff`. */
  fontColor: string;
  fontSize: number;
  fontWeightLabel: InteractivePriceLineFontWeight;
  fontWeightValues: InteractivePriceLineFontWeight;
  infoBoxLineWidth: number;
  infoBoxPaddingH: number;
  infoBoxPaddingV: number;
  priceLineWidth: number;
  /** As passed; `undefined` = the plugin / chart background. */
  backgroundColor: string | undefined;
  icon: string;
  iconFontWeight: InteractivePriceLineFontWeight;
  iconColor: string;
  iconBackground: string | undefined;
  iconPaddingH: number;
  iconPaddingV: number;
  iconPosition: InteractivePriceLineIconPosition;
  iconSize: number;
  iconOffset: number;
  showOrderValue: boolean;
  showHoldingValueColor: boolean;
  quantity: string;
  label: string;
  actions: readonly InteractivePriceLineAction[];
  confirmed: boolean;
  extraData: InteractivePriceLineExtraData;
}

export interface InteractivePriceLineEditRequest {
  line: InteractivePriceLine;
  field: InteractivePriceLineField;
  anchor: InteractivePriceLineAnchor;
}

export interface InteractivePriceLineActionEvent {
  line: InteractivePriceLine;
  action: InteractivePriceLineAction;
}

export interface InteractivePriceLinePriceChange {
  line: InteractivePriceLine;
  previousPrice: number;
}

export interface InteractivePriceLineDragStart {
  /** The line at the moment the drag starts (its `price` is still the price before the drag). */
  line: InteractivePriceLine;
}

export interface InteractivePriceLineContextMenuEvent {
  /** `coordinateToPrice(y)` for the clicked point; `null` outside the pane or if unavailable. */
  price: number | null;
  /** The line whose control or line band was clicked, else `null`. Never a `holding`. */
  line: InteractivePriceLine | null;
  clientX: number;
  clientY: number;
}

type HitArea = 'grip' | 'quantity' | 'label' | 'line' | InteractivePriceLineAction;

interface Rect { left: number; top: number; width: number; height: number; }
interface StoredLine extends Omit<InteractivePriceLine, 'fontColor'> {
  priceLine: IPriceLine;
  /** `colorPriceLine` as passed by the host (undefined → default colour, and text does not inherit it). */
  colorPriceLineOption: string | undefined;
  /** `colorInfoBoxBorder` as passed by the host; undefined means it follows `colorPriceLine`. */
  colorInfoBoxBorderOption: string | undefined;
  fontColorOption: string | undefined;
  /** `iconColor` as passed by the host; undefined means it follows `colorPriceLine`. */
  iconColorOption: string | undefined;
}

interface Metrics {
  measure: (text: string, fontSize: number, weight: InteractivePriceLineFontWeight) => number;
  remPx: number;
  fontFamily: string;
  borderRadius: number;
  background: string;
  /** Last price of the series, `null` if there is none. Reference of `showOrderValue`. */
  currentPrice: number | null;
}

/** A piece of text with its own weight. A segment is drawn as consecutive runs, centred as a group. */
interface Run { text: string; weight: InteractivePriceLineFontWeight; color?: string; }

interface InfoBox {
  rect: Rect;
  /** Orders: drag-only handle with dots. Alerts: the label segment (drag only). */
  grip: Rect | null;
  /** Orders only. */
  quantity: Rect | null;
  /** Hit area for the label and optional order-value segments; orders only, it opens the label editor. */
  label: Rect | null;
  /** All texts (as runs) with the rect they are centred in. */
  texts: { runs: Run[]; rect: Rect }[];
  /** x of each separator line. */
  separators: number[];
  /** Draw the grip dots. */
  dots: boolean;
}
interface IconLayout { glyph: Rect; background: Rect; }
interface LineLayout {
  y: number;
  band: Rect;
  info: InfoBox | null;
  cancel: Rect | null;
  confirm: Rect | null;
  /** Icon glyph and its padded backdrop, right-aligned at `iconOffset`. */
  icon: IconLayout | null;
  /** Orders: row spanning all (also currently hidden) controls and the info box, so hover survives the gaps. */
  region: Rect | null;
}
interface RenderEntry { line: InteractivePriceLine; layout: LineLayout; }

interface Gesture {
  line: StoredLine;
  area: HitArea;
  rect: Rect;
  pointerId: number;
  startX: number;
  startY: number;
  /** Pointer y minus line y at press, so the line does not jump under the pointer. */
  grabOffsetY: number;
  previousPrice: number;
  dragging: boolean;
  orderValueWidth?: number;
  handleScroll: unknown;
  handleScale: unknown;
}

const BASE_FONT_SIZE = 12;
/** Row height at `BASE_FONT_SIZE`; scales proportionally with `fontSize`. */
const BASE_ROW_HEIGHT = 22;
const CONTROL_GAP = 6;
const GRIP_WIDTH = 18;
const SEPARATOR_WIDTH = 1;
/** Default left and right margin between a box border / separator and text. */
const DEFAULT_INFO_BOX_PADDING_H = 8;
const DEFAULT_INFO_BOX_PADDING_V = (BASE_ROW_HEIGHT - BASE_FONT_SIZE) / 2;
/** Widths of empty segments (the quantity segment of an order is always present). */
const MIN_QUANTITY_WIDTH = 28;
const MIN_LABEL_WIDTH = 22;
/** Gap between the pane's right edge (price scale) and the order / holding boxes. */
const RIGHT_OFFSET_REM = 5;
/** The line is draggable within this many CSS px above and below it. */
const LINE_HIT_TOLERANCE = 2;
/** A press that moves less than this many CSS px is a click, otherwise a price drag. */
const DRAG_THRESHOLD = 4;
const END_DOT_RADIUS = 3;
const END_DOT_INSET = 12;
/** Last resort text colour, when neither `fontColor` nor `colorPriceLine` is passed. */
const TEXT_COLOR = '#fff';
const FALLBACK_BACKGROUND = '#020305';
const DEFAULT_COLOR = '#F23645';
const POSITIVE_GAIN_COLOR = '#089981';
const NEGATIVE_GAIN_COLOR = '#F23645';
const DEFAULT_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const DEFAULT_RADIUS = 6;
const ID_PREFIX = 'interactive-price-lines';
const DEFAULT_FONT_WEIGHT: InteractivePriceLineFontWeight = 'normal';
const DEFAULT_LINE_WIDTH = 1;
const DEFAULT_ICON_SIZE = 20;
const DEFAULT_ICON_OFFSET = 20;
const FONT_WEIGHT_KEYWORDS = ['normal', 'bold', 'bolder', 'lighter'];
/** `showOrderValue`: `-2,23 %` (German decimal comma, explicit `+` for gains, no sign for exactly zero). */
const PERCENT_FORMAT = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

function containsDisk(rect: Rect, x: number, y: number): boolean {
  const radius = rect.width / 2;
  return Math.hypot(x - (rect.left + radius), y - (rect.top + rect.height / 2)) <= radius;
}

function rowHeightFor(fontSize: number, paddingV = DEFAULT_INFO_BOX_PADDING_V): number {
  return Math.round(fontSize * (BASE_FONT_SIZE + paddingV * 2) / BASE_FONT_SIZE);
}

function checkFontSize(fontSize: number): number {
  if (!Number.isFinite(fontSize) || fontSize <= 0) throw new Error('InteractivePriceLines: `fontSize` must be a positive number');
  return fontSize;
}

function checkIconPosition(position: InteractivePriceLineIconPosition): InteractivePriceLineIconPosition {
  if (position !== 'middle' && position !== 'above' && position !== 'below') {
    throw new Error('InteractivePriceLines: `iconPosition` must be `middle`, `above` or `below`');
  }
  return position;
}

function checkNumber(name: string, value: number, allowZero: boolean): number {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new Error(`InteractivePriceLines: \`${name}\` must be a ${allowZero ? 'non-negative' : 'positive'} number`);
  }
  return value;
}

function checkFontWeight(name: string, weight: InteractivePriceLineFontWeight): InteractivePriceLineFontWeight {
  // An invalid weight would make the canvas silently ignore the whole `font` string, so reject it early.
  const valid = typeof weight === 'number' ? Number.isFinite(weight) && weight >= 1 && weight <= 1000 : FONT_WEIGHT_KEYWORDS.includes(weight);
  if (!valid) throw new Error(`InteractivePriceLines: \`${name}\` must be normal, bold, bolder, lighter or a number from 1 to 1000`);
  return weight;
}

/** Deep copy of an options value. `chart.options()` hands out live objects that `applyOptions` mutates in place. */
function snapshot<T>(value: T): T {
  return typeof value === 'object' && value !== null ? structuredClone(value) : value;
}

/** Sum of the run widths. */
function runsWidth(runs: readonly Run[], fontSize: number, m: Metrics): number {
  return runs.reduce((sum, run) => sum + (run.text === '' ? 0 : m.measure(run.text, fontSize, run.weight)), 0);
}

/** Text width plus the same margin on both sides; empty segments get a minimum width. */
function segmentWidth(runs: readonly Run[], fontSize: number, minWidth: number, m: Metrics, padding: number): number {
  return runs.every(run => run.text === '') ? minWidth : Math.ceil(runsWidth(runs, fontSize, m)) + padding * 2;
}

/** `showOrderValue`: % distance of the line price from the current price, or `''` if not shown / not computable. */
function orderValueText(line: InteractivePriceLine, m: Metrics): string {
  const current = m.currentPrice;
  if (!line.showOrderValue || current === null || current === 0) return '';
  return `${PERCENT_FORMAT.format((line.price - current) / Math.abs(current) * 100)} %`;
}

function orderValueWidth(line: InteractivePriceLine, m: Metrics): number {
  const value = orderValueText(line, m);
  if (value === '') return 0;
  return segmentWidth([{ text: value, weight: line.fontWeightValues }], line.fontSize, MIN_LABEL_WIDTH, m, line.infoBoxPaddingH);
}

function gainTextColor(value: string | number): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return value < 0 ? NEGATIVE_GAIN_COLOR : POSITIVE_GAIN_COLOR;
  }
  let normalized = value.trim().replace(/[−–]/g, '-').replace(/[^0-9,.-]/g, '');
  const comma = normalized.lastIndexOf(',');
  const period = normalized.lastIndexOf('.');
  if (comma >= 0 && period >= 0) {
    normalized = comma > period
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = normalized.replace(',', '.');
  }
  if (normalized === '') return undefined;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return undefined;
  return numeric < 0 ? NEGATIVE_GAIN_COLOR : POSITIVE_GAIN_COLOR;
}

/**
 * Single geometry source shared by drawing and hit testing (CSS px, pane coordinates).
 * Hidden controls are `null` and therefore neither painted nor hit-testable.
 * Orders: `✓` while unconfirmed, `✕` while unconfirmed or hovered. Alerts: the whole box only while hovered.
 */
function layoutLine(line: InteractivePriceLine, y: number, paneWidth: number, m: Metrics, hovered: boolean, minimumOrderValueWidth = 0): LineLayout {
  const layout = layoutBody(line, y, paneWidth, m, hovered, minimumOrderValueWidth);
  if (line.icon === '') return layout;
  const glyphWidth = Math.max(line.iconSize, Math.ceil(m.measure(line.icon, line.iconSize, line.iconFontWeight)));
  const backgroundWidth = glyphWidth + line.iconPaddingH * 2;
  const backgroundHeight = line.iconSize + line.iconPaddingV * 2;
  const backgroundLeft = paneWidth - line.iconOffset - backgroundWidth;
  const backgroundTop = line.iconPosition === 'above' ? y - backgroundHeight
    : line.iconPosition === 'below' ? y
      : y - backgroundHeight / 2;
  return {
    ...layout,
    icon: {
      background: { left: backgroundLeft, top: backgroundTop, width: backgroundWidth, height: backgroundHeight },
      glyph: {
        left: backgroundLeft + line.iconPaddingH,
        top: backgroundTop + line.iconPaddingV,
        width: glyphWidth,
        height: line.iconSize,
      },
    },
  };
}

function layoutBody(line: InteractivePriceLine, y: number, paneWidth: number, m: Metrics, hovered: boolean, minimumOrderValueWidth: number): LineLayout {
  const rowHeight = rowHeightFor(line.fontSize);
  const infoBoxHeight = rowHeightFor(line.fontSize, line.infoBoxPaddingV);
  const halfBand = Math.max(LINE_HIT_TOLERANCE, line.priceLineWidth / 2);
  const band: Rect = { left: 0, top: y - halfBand, width: paneWidth, height: halfBand * 2 };
  const rightEdge = paneWidth - RIGHT_OFFSET_REM * m.remPx;
  const seg = (left: number, width: number, height = rowHeight): Rect => ({ left, top: y - height / 2, width, height });

  if (line.lineType === 'alert') {
    // border | pad label pad | separator | ✕ | border, centred in the pane. Needs `cancel` for the ✕ segment.
    if (!hovered) return { y, band, info: null, cancel: null, confirm: null, icon: null, region: null };
    const hasCancel = line.actions.includes('cancel');
    const labelRuns: Run[] = [{ text: line.label, weight: line.fontWeightLabel }];
    const labelWidth = segmentWidth(labelRuns, line.fontSize, MIN_LABEL_WIDTH, m, line.infoBoxPaddingH);
    const cancelWidth = hasCancel ? SEPARATOR_WIDTH + infoBoxHeight : 0;
    const width = labelWidth + cancelWidth;
    const left = Math.round((paneWidth - width) / 2);
    const grip = seg(left, labelWidth, infoBoxHeight);
    const cancel = hasCancel ? seg(left + labelWidth + SEPARATOR_WIDTH, infoBoxHeight) : null;
    const info: InfoBox = {
      rect: seg(left, width, infoBoxHeight), grip, quantity: null, label: null, dots: false,
      texts: [{ runs: labelRuns, rect: grip }], separators: hasCancel ? [left + labelWidth] : [],
    };
    return { y, band, info, cancel, confirm: null, icon: null, region: null };
  }

  if (line.lineType === 'temporary') return { y, band, info: null, cancel: null, confirm: null, icon: null, region: null };

  if (line.lineType === 'holding') {
    // `Owned: amount | abs gain | rel gain`: the amount shares the first segment with the label; absent / empty values are skipped.
    const { holdingAmount, holdingAbsGain, holdingRelGain } = line.extraData;
    const present = (value: string | number | undefined): value is string | number => value !== undefined && String(value) !== '';
    const values = (value: string | number): Run[] => [{
      text: String(value),
      weight: line.fontWeightValues,
      color: line.showHoldingValueColor ? gainTextColor(value) : undefined,
    }];
    const texts: Run[][] = [
      present(holdingAmount)
        ? [{ text: `${line.label}:`, weight: line.fontWeightLabel }, { text: ` ${holdingAmount}`, weight: line.fontWeightValues }]
        : [{ text: line.label, weight: line.fontWeightLabel }],
      ...[holdingAbsGain, holdingRelGain].filter(present).map(values),
    ];
    const widths = texts.map(runs => segmentWidth(runs, line.fontSize, MIN_LABEL_WIDTH, m, line.infoBoxPaddingH));
    const total = widths.reduce((sum, width) => sum + width, 0) + SEPARATOR_WIDTH * (texts.length - 1);
    let cursor = Math.max(0, rightEdge - total);
    const rect = seg(cursor, total, infoBoxHeight);
    const separators: number[] = [];
    const placed = texts.map((runs, index) => {
      if (index > 0) { separators.push(cursor); cursor += SEPARATOR_WIDTH; }
      const r = seg(cursor, widths[index], infoBoxHeight); cursor += widths[index]; return { runs, rect: r };
    });
    return { y, band, info: { rect, grip: null, quantity: null, label: null, dots: false, texts: placed, separators }, cancel: null, confirm: null, icon: null, region: null };
  }

  // grip | pad quantity pad | separator | pad label pad | separator | pad value pad | border.
  const quantityRuns: Run[] = [{ text: line.quantity, weight: line.fontWeightValues }];
  const labelRuns: Run[] = [{ text: line.label, weight: line.fontWeightLabel }];
  const value = orderValueText(line, m);
  const valueRuns: Run[] = value === '' ? [] : [{ text: value, weight: line.fontWeightValues }];
  const quantityWidth = segmentWidth(quantityRuns, line.fontSize, MIN_QUANTITY_WIDTH, m, line.infoBoxPaddingH);
  const hasLabel = line.label !== '' || valueRuns.length === 0;
  const labelWidth = hasLabel ? segmentWidth(labelRuns, line.fontSize, MIN_LABEL_WIDTH, m, line.infoBoxPaddingH) : 0;
  const actualValueWidth = valueRuns.length === 0 ? 0 : segmentWidth(valueRuns, line.fontSize, MIN_LABEL_WIDTH, m, line.infoBoxPaddingH);
  const valueWidth = valueRuns.length === 0 ? 0 : Math.max(actualValueWidth, minimumOrderValueWidth);
  const infoWidth = GRIP_WIDTH + quantityWidth
    + (hasLabel ? SEPARATOR_WIDTH + labelWidth : 0)
    + (valueRuns.length > 0 ? SEPARATOR_WIDTH + valueWidth : 0);
  // The info box is anchored to the right offset and never moves when ✕ / ✓ appear or disappear.
  const infoLeft = Math.max(0, rightEdge - infoWidth);
  const grip = seg(infoLeft, GRIP_WIDTH, infoBoxHeight);
  const quantity = seg(infoLeft + GRIP_WIDTH, quantityWidth, infoBoxHeight);
  const labelLeft = quantity.left + quantityWidth;
  const label = seg(labelLeft, (hasLabel ? SEPARATOR_WIDTH + labelWidth : 0) + (valueRuns.length > 0 ? SEPARATOR_WIDTH + valueWidth : 0), infoBoxHeight);
  const labelText = hasLabel ? seg(labelLeft + SEPARATOR_WIDTH, labelWidth, infoBoxHeight) : null;
  const valueBoxLeft = labelLeft + (hasLabel ? SEPARATOR_WIDTH + labelWidth + SEPARATOR_WIDTH : SEPARATOR_WIDTH);
  const valueBox = valueRuns.length > 0 ? seg(valueBoxLeft, valueWidth, infoBoxHeight) : null;
  const info: InfoBox = {
    rect: seg(infoLeft, infoWidth, infoBoxHeight), grip, quantity, label, dots: true,
    texts: [
      { runs: quantityRuns, rect: quantity },
      ...(labelText === null ? [] : [{ runs: labelRuns, rect: labelText }]),
      ...(valueBox === null ? [] : [{ runs: valueRuns, rect: valueBox }]),
    ],
    separators: [labelLeft, ...(valueBox === null ? [] : [valueBox.left - SEPARATOR_WIDTH])],
  };

  // Slots are laid out whether or not the buttons are visible, so nothing moves on hover.
  let cursor = infoLeft;
  let confirm: Rect | null = null;
  let cancel: Rect | null = null;
  if (!line.confirmed && line.actions.includes('confirm')) {
    cursor -= CONTROL_GAP + rowHeight;
    confirm = seg(cursor, rowHeight);
  }
  if (line.actions.includes('cancel')) {
    cursor -= CONTROL_GAP + rowHeight;
    if (!line.confirmed || hovered) cancel = seg(cursor, rowHeight);
  }
  const regionTop = Math.min(y - rowHeight / 2, y - infoBoxHeight / 2);
  const regionBottom = Math.max(y + rowHeight / 2, y + infoBoxHeight / 2);
  return {
    y, band, info, cancel, confirm, icon: null,
    region: { left: cursor, top: regionTop, width: infoLeft + infoWidth - cursor, height: regionBottom - regionTop },
  };
}

interface Hit { line: StoredLine; area: HitArea; rect: Rect; }

/** Returns the control hit in a layout (topmost first), ignoring the line band. */
function controlAt(layout: LineLayout, line: InteractivePriceLine, x: number, y: number): { area: HitArea; rect: Rect } | null {
  if (layout.confirm !== null && containsDisk(layout.confirm, x, y)) return { area: 'confirm', rect: layout.confirm };
  if (layout.cancel !== null) {
    const hit = line.lineType === 'alert' ? contains(layout.cancel, x, y) : containsDisk(layout.cancel, x, y);
    if (hit) return { area: 'cancel', rect: layout.cancel };
  }
  if (layout.info !== null) {
    const { quantity, label, grip } = layout.info;
    if (quantity !== null && contains(quantity, x, y)) return { area: 'quantity', rect: quantity };
    if (label !== null && contains(label, x, y)) return { area: 'label', rect: label };
    if (grip !== null && contains(grip, x, y)) return { area: 'grip', rect: grip };
  }
  return null;
}

class LinesRenderer implements IPrimitivePaneRenderer {
  public constructor(
    private readonly _entries: readonly RenderEntry[],
    private readonly _paneWidth: number,
    private readonly _metrics: Metrics
  ) { }

  public draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: h, verticalPixelRatio: v }) => {
      const m = this._metrics;
      const bitmapWidth = (cssWidth: number): number => Math.max(1, Math.round(cssWidth * h));
      const snap = (r: Rect): { x: number; y: number; w: number; h: number } => {
        const x0 = Math.round(r.left * h); const y0 = Math.round(r.top * v);
        return { x: x0, y: y0, w: Math.round((r.left + r.width) * h) - x0, h: Math.round((r.top + r.height) * v) - y0 };
      };
      const path = (r: Rect, radius: number, inset: number): void => {
        const s = snap(r);
        ctx.beginPath();
        ctx.roundRect(s.x + inset, s.y + inset, s.w - inset * 2, s.h - inset * 2, Math.max(0, radius * h - inset));
      };
      // Masks whatever is beneath (the line) with the background, then draws a crisp border (none if `width` is 0).
      const box = (r: Rect, color: string, fill: string, width: number, radius = m.borderRadius): void => {
        path(r, radius, 0); ctx.fillStyle = fill; ctx.fill();
        if (width === 0) return;
        const bw = bitmapWidth(width);
        path(r, radius, bw / 2); ctx.strokeStyle = color; ctx.lineWidth = bw; ctx.stroke();
      };
      const disk = (r: Rect, color: string, fill: string): void => box(r, color, fill, 1, r.width / 2);
      const font = (weight: InteractivePriceLineFontWeight, fontSize: number): string => `${weight} ${fontSize * h}px ${m.fontFamily}`;
      // Draws the runs one after another, centred as a group in `r`.
      const text = (runs: readonly Run[], r: Rect, color: string, fontSize: number): void => {
        const parts = runs.filter(run => run.text !== ''); if (parts.length === 0) return;
        const widths = parts.map(run => { ctx.font = font(run.weight, fontSize); return ctx.measureText(run.text).width; });
        let x = Math.round((r.left + r.width / 2) * h - widths.reduce((sum, width) => sum + width, 0) / 2);
        const y = Math.round((r.top + r.height / 2) * v);
        ctx.fillStyle = color;
        parts.forEach((run, index) => { ctx.font = font(run.weight, fontSize); ctx.fillStyle = run.color ?? color; ctx.fillText(run.text, x, y); x += widths[index]; });
      };
      const plain = (value: string, r: Rect, color: string, fontSize: number): void => text([{ text: value, weight: DEFAULT_FONT_WEIGHT }], r, color, fontSize);

      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      // Pass 1: all lines, so that every control (pass 2) masks every line beneath it.
      for (const { line, layout } of this._entries) {
        const width = bitmapWidth(line.priceLineWidth);
        const yy = Math.round(layout.y * v - width / 2) + width / 2;
        ctx.strokeStyle = line.colorPriceLine; ctx.fillStyle = line.colorPriceLine; ctx.lineWidth = width;
        ctx.setLineDash(
          line.lineType === 'temporary' ? [10 * h, 4 * h, 2 * h, 4 * h]
            : line.lineType === 'alert' ? [6 * h, 4 * h]
              : line.lineType === 'holding' ? [2 * h, 3 * h]
                : [10 * h, 4 * h, 2 * h, 4 * h]
        );
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(this._paneWidth * h, yy); ctx.stroke();
        ctx.setLineDash([]);
        if (line.lineType === 'order') {
          ctx.beginPath(); ctx.arc((this._paneWidth - END_DOT_INSET) * h, yy, END_DOT_RADIUS * h, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Pass 2: info-box borders and separators use their own colour; other controls use the price-line colour.
      for (const { line, layout } of this._entries) {
        const fill = line.backgroundColor ?? m.background;
        if (layout.info !== null) {
          const { rect, grip, dots, texts, separators } = layout.info;
          box(rect, line.colorInfoBoxBorder, fill, line.infoBoxLineWidth);
          const inset = Math.round(rect.height * 4 / BASE_ROW_HEIGHT);
          if (dots && grip !== null) {
            ctx.fillStyle = line.colorPriceLine;
            for (let col = 0; col < 2; col++) for (let row = 0; row < 3; row++) {
              ctx.beginPath();
              ctx.arc((grip.left + grip.width / 2 - 2 + col * 4) * h, (grip.top + grip.height / 2 - 4 + row * 4) * v, 1.1 * h, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          if (line.infoBoxLineWidth > 0) {
            const sw = bitmapWidth(1); // Separator Width
            for (const x of separators) {
              const sepX = Math.round(x * h) + sw / 2;
              ctx.beginPath(); ctx.moveTo(sepX, Math.round((rect.top + inset) * v)); ctx.lineTo(sepX, Math.round((rect.top + rect.height - inset) * v));
              ctx.strokeStyle = line.colorInfoBoxBorder; ctx.lineWidth = sw; ctx.stroke();
            }
          }
          for (const { runs, rect: r } of texts) text(runs, r, line.fontColor, line.fontSize);
        }
        if (layout.confirm !== null) { disk(layout.confirm, line.colorPriceLine, fill); plain('✓', layout.confirm, line.colorPriceLine, line.fontSize); }
        if (layout.cancel !== null) {
          if (line.lineType !== 'alert') disk(layout.cancel, line.colorPriceLine, fill);
          plain('✕', layout.cancel, line.colorPriceLine, line.fontSize);
        }
        if (layout.icon !== null) {
          // The backdrop keeps the line from running through the glyph.
          const s = snap(layout.icon.background); ctx.fillStyle = line.iconBackground ?? fill; ctx.fillRect(s.x, s.y, s.w, s.h);
          text([{ text: line.icon, weight: line.iconFontWeight }], layout.icon.glyph, line.iconColor, line.iconSize);
        }
      }
      ctx.restore();
    });
  }
}

class LinesPaneView implements IPrimitivePaneView {
  public constructor(private readonly _state: () => { entries: readonly RenderEntry[]; paneWidth: number; metrics: Metrics } | null) { }
  public zOrder(): PrimitivePaneViewZOrder { return 'top'; }
  public renderer(): IPrimitivePaneRenderer | null {
    const state = this._state();
    return state === null ? null : new LinesRenderer(state.entries, state.paneWidth, state.metrics);
  }
}

/**
 * A series primitive for annotated price levels. It renders, hit-tests and drags on the
 * chart; the host owns popup editors, context menus and business actions.
 */
export class InteractivePriceLines extends PluginBase {
  private readonly _paneViews: readonly IPrimitivePaneView[] = [new LinesPaneView(() => this._renderState())];
  private readonly _lines = new Map<string, StoredLine>();
  private readonly _editRequested = new Delegate<InteractivePriceLineEditRequest>();
  private readonly _actionClicked = new Delegate<InteractivePriceLineActionEvent>();
  private readonly _priceChanged = new Delegate<InteractivePriceLinePriceChange>();
  private readonly _dragStarted = new Delegate<InteractivePriceLineDragStart>();
  private readonly _contextMenuRequested = new Delegate<InteractivePriceLineContextMenuEvent>();
  private _attached = false;
  private _gesture: Gesture | null = null;
  private _hoveredId: string | null = null;
  private _measureContext: CanvasRenderingContext2D | null = null;

  /** `container` is the chart container and supplies pointer capture for drag gestures. */
  public constructor(private readonly _container: HTMLElement, private readonly _options: InteractivePriceLinesOptions = {}) { super(); }

  public override attached(param: SeriesAttachedParameter<Time>): void {
    super.attached(param);
    this._attached = true;
    this._container.addEventListener('pointerdown', this._onPointerDown, true);
    this._container.addEventListener('pointermove', this._onPointerMove, true);
    this._container.addEventListener('pointerup', this._onPointerUp, true);
    this._container.addEventListener('pointercancel', this._onPointerCancel, true);
    this._container.addEventListener('pointerleave', this._onPointerLeave, true);
    this._container.addEventListener('contextmenu', this._onContextMenu, true);
  }

  public override detached(): void {
    this._endGesture(false);
    this._container.removeEventListener('pointerdown', this._onPointerDown, true);
    this._container.removeEventListener('pointermove', this._onPointerMove, true);
    this._container.removeEventListener('pointerup', this._onPointerUp, true);
    this._container.removeEventListener('pointercancel', this._onPointerCancel, true);
    this._container.removeEventListener('pointerleave', this._onPointerLeave, true);
    this._container.removeEventListener('contextmenu', this._onContextMenu, true);
    for (const line of this._lines.values()) this.series.removePriceLine(line.priceLine);
    this._lines.clear(); this._hoveredId = null; this._attached = false;
    super.detached();
  }

  public paneViews(): readonly IPrimitivePaneView[] { return this._paneViews; }

  public hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const hit = this._hitAt(x, y);
    if (hit === null) return null;
    return { externalId: `${ID_PREFIX}:${hit.line.id}:${hit.area}`, zOrder: 'top', cursorStyle: hit.area === 'line' || hit.area === 'grip' ? 'ns-resize' : 'pointer' };
  }

  public addLine(options: InteractivePriceLineOptions): InteractivePriceLine {
    if (this._lines.has(options.id)) throw new Error(`InteractivePriceLines: duplicate id "${options.id}"`);
    const series = this._requireSeries();
    const colorPriceLine = options.colorPriceLine ?? DEFAULT_COLOR;
    const colorInfoBoxBorder = options.colorInfoBoxBorder ?? colorPriceLine;
    const fontSize = checkFontSize(options.fontSize ?? BASE_FONT_SIZE);
    const line: StoredLine = {
      id: options.id, price: options.price, lineType: options.lineType ?? 'order', colorPriceLine, colorInfoBoxBorder, fontSize,
      colorPriceLineOption: options.colorPriceLine, colorInfoBoxBorderOption: options.colorInfoBoxBorder, fontColorOption: options.fontColor,
      fontWeightLabel: checkFontWeight('fontWeightLabel', options.fontWeightLabel ?? DEFAULT_FONT_WEIGHT),
      fontWeightValues: checkFontWeight('fontWeightValues', options.fontWeightValues ?? DEFAULT_FONT_WEIGHT),
      infoBoxLineWidth: checkNumber('infoBoxLineWidth', options.infoBoxLineWidth ?? DEFAULT_LINE_WIDTH, true),
      infoBoxPaddingH: checkNumber('infoBoxPaddingH', options.infoBoxPaddingH ?? DEFAULT_INFO_BOX_PADDING_H, true),
      infoBoxPaddingV: checkNumber('infoBoxPaddingV', options.infoBoxPaddingV ?? DEFAULT_INFO_BOX_PADDING_V, true),
      priceLineWidth: checkNumber('priceLineWidth', options.priceLineWidth ?? DEFAULT_LINE_WIDTH, false),
      backgroundColor: options.backgroundColor === '' ? undefined : options.backgroundColor,
      icon: options.icon ?? '',
      iconFontWeight: checkFontWeight('iconFontWeight', options.iconFontWeight ?? DEFAULT_FONT_WEIGHT),
      iconColor: options.iconColor ?? colorPriceLine,
      iconColorOption: options.iconColor,
      iconBackground: options.iconBackground === '' ? undefined : options.iconBackground,
      iconPaddingH: checkNumber('iconPaddingH', options.iconPaddingH ?? 0, true),
      iconPaddingV: checkNumber('iconPaddingV', options.iconPaddingV ?? 0, true),
      iconPosition: checkIconPosition(options.iconPosition ?? 'middle'),
      iconSize: checkNumber('iconSize', options.iconSize ?? DEFAULT_ICON_SIZE, false),
      iconOffset: checkNumber('iconOffset', options.iconOffset ?? DEFAULT_ICON_OFFSET, true),
      showOrderValue: options.showOrderValue ?? false,
      showHoldingValueColor: options.showHoldingValueColor ?? false,
      quantity: options.quantity ?? '', actions: options.actions ?? [], confirmed: options.confirmed ?? false,
      label: options.label ?? (options.lineType === 'holding' ? 'Owned' : 'Price line'), extraData: { ...options.extraData },
      // The canvas draws the line itself (so controls can mask it); the native line only provides the axis label.
      priceLine: series.createPriceLine({ id: `${ID_PREFIX}:${options.id}`, price: options.price, color: colorPriceLine, lineWidth: 1, lineVisible: false, axisLabelVisible: true }),
    };
    this._lines.set(line.id, line); this.requestUpdate(); return this._publicLine(line);
  }

  /** `lineType` is immutable and cannot be patched. */
  public updateLine(id: string, patch: Partial<Omit<InteractivePriceLineOptions, 'id' | 'lineType'>>): InteractivePriceLine {
    if ('lineType' in patch) throw new Error('InteractivePriceLines: `lineType` is immutable');
    const line = this._requireLine(id);
    // Validate everything first so a bad patch changes nothing.
    if (patch.fontSize !== undefined) checkFontSize(patch.fontSize);
    if (patch.fontWeightLabel !== undefined) checkFontWeight('fontWeightLabel', patch.fontWeightLabel);
    if (patch.fontWeightValues !== undefined) checkFontWeight('fontWeightValues', patch.fontWeightValues);
    if (patch.iconFontWeight !== undefined) checkFontWeight('iconFontWeight', patch.iconFontWeight);
    if (patch.infoBoxLineWidth !== undefined) checkNumber('infoBoxLineWidth', patch.infoBoxLineWidth, true);
    if (patch.infoBoxPaddingH !== undefined) checkNumber('infoBoxPaddingH', patch.infoBoxPaddingH, true);
    if (patch.infoBoxPaddingV !== undefined) checkNumber('infoBoxPaddingV', patch.infoBoxPaddingV, true);
    if (patch.priceLineWidth !== undefined) checkNumber('priceLineWidth', patch.priceLineWidth, false);
    if (patch.iconSize !== undefined) checkNumber('iconSize', patch.iconSize, false);
    if (patch.iconOffset !== undefined) checkNumber('iconOffset', patch.iconOffset, true);
    if (patch.iconPaddingH !== undefined) checkNumber('iconPaddingH', patch.iconPaddingH, true);
    if (patch.iconPaddingV !== undefined) checkNumber('iconPaddingV', patch.iconPaddingV, true);
    if (patch.iconPosition !== undefined) checkIconPosition(patch.iconPosition);
    if (patch.price !== undefined) { line.price = patch.price; line.priceLine.applyOptions({ price: patch.price }); }
    if (patch.colorPriceLine !== undefined) {
      line.colorPriceLine = patch.colorPriceLine;
      line.colorPriceLineOption = patch.colorPriceLine;
      line.priceLine.applyOptions({ color: patch.colorPriceLine });
      if (line.colorInfoBoxBorderOption === undefined) line.colorInfoBoxBorder = patch.colorPriceLine;
      if (line.iconColorOption === undefined) line.iconColor = patch.colorPriceLine;
    }
    if (patch.colorInfoBoxBorder !== undefined) {
      line.colorInfoBoxBorder = patch.colorInfoBoxBorder;
      line.colorInfoBoxBorderOption = patch.colorInfoBoxBorder;
    }
    if (patch.fontColor !== undefined) line.fontColorOption = patch.fontColor;
    if (patch.fontSize !== undefined) line.fontSize = patch.fontSize;
    if (patch.fontWeightLabel !== undefined) line.fontWeightLabel = patch.fontWeightLabel;
    if (patch.fontWeightValues !== undefined) line.fontWeightValues = patch.fontWeightValues;
    if (patch.iconFontWeight !== undefined) line.iconFontWeight = patch.iconFontWeight;
    if (patch.infoBoxLineWidth !== undefined) line.infoBoxLineWidth = patch.infoBoxLineWidth;
    if (patch.infoBoxPaddingH !== undefined) line.infoBoxPaddingH = patch.infoBoxPaddingH;
    if (patch.infoBoxPaddingV !== undefined) line.infoBoxPaddingV = patch.infoBoxPaddingV;
    if (patch.priceLineWidth !== undefined) line.priceLineWidth = patch.priceLineWidth;
    if (patch.backgroundColor !== undefined) line.backgroundColor = patch.backgroundColor === '' ? undefined : patch.backgroundColor; // '' = back to the plugin / chart background
    if (patch.icon !== undefined) line.icon = patch.icon;
    if (patch.iconColor !== undefined) { line.iconColor = patch.iconColor; line.iconColorOption = patch.iconColor; }
    if (patch.iconBackground !== undefined) line.iconBackground = patch.iconBackground === '' ? undefined : patch.iconBackground;
    if (patch.iconPaddingH !== undefined) line.iconPaddingH = patch.iconPaddingH;
    if (patch.iconPaddingV !== undefined) line.iconPaddingV = patch.iconPaddingV;
    if (patch.iconPosition !== undefined) line.iconPosition = patch.iconPosition;
    if (patch.iconSize !== undefined) line.iconSize = patch.iconSize;
    if (patch.iconOffset !== undefined) line.iconOffset = patch.iconOffset;
    if (patch.showOrderValue !== undefined) line.showOrderValue = patch.showOrderValue;
    if (patch.showHoldingValueColor !== undefined) line.showHoldingValueColor = patch.showHoldingValueColor;
    if (patch.quantity !== undefined) line.quantity = patch.quantity;
    if (patch.label !== undefined) line.label = patch.label;
    if (patch.actions !== undefined) line.actions = patch.actions;
    if (patch.confirmed !== undefined) line.confirmed = patch.confirmed;
    if (patch.extraData !== undefined) line.extraData = { ...patch.extraData };
    this.requestUpdate(); return this._publicLine(line);
  }

  public removeLine(id: string): boolean {
    const line = this._lines.get(id); if (line === undefined) return false;
    if (this._gesture?.line === line) this._endGesture(false);
    if (this._hoveredId === id) this._hoveredId = null;
    if (this._attached) this.series.removePriceLine(line.priceLine);
    this._lines.delete(id); this.requestUpdate(); return true;
  }

  public lines(): readonly InteractivePriceLine[] { return [...this._lines.values()].map(line => this._publicLine(line)); }
  public editRequested(): ISubscription<InteractivePriceLineEditRequest> { return this._editRequested; }
  public actionClicked(): ISubscription<InteractivePriceLineActionEvent> { return this._actionClicked; }
  public priceChanged(): ISubscription<InteractivePriceLinePriceChange> { return this._priceChanged; }
  /** Fired once when a press turns into a drag (movement beyond the threshold), before the line moves. */
  public dragStarted(): ISubscription<InteractivePriceLineDragStart> { return this._dragStarted; }
  /** Fired on right click anywhere on the chart; the browser's own context menu is suppressed. */
  public contextMenuRequested(): ISubscription<InteractivePriceLineContextMenuEvent> { return this._contextMenuRequested; }

  // Gesture model: press arms, movement beyond DRAG_THRESHOLD starts a price drag, release without it is a click.
  private readonly _onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary || !this._attached) return;
    // A gesture still pending here lost its pointerup / pointercancel: end it, otherwise scroll and scale would stay locked.
    if (this._gesture !== null) this._endGesture(false);
    const point = this._localPoint(event); if (point === null) return;
    const hit = this._hitAt(point.x, point.y); if (hit === null) return;
    event.preventDefault(); event.stopPropagation();
    const chart = this.chart;
    // `chart.options()` returns the live options object and `applyOptions` merges into it in place: without a deep
    // copy the "saved" values below are overwritten by the `false` locks and scroll / scale are never restored.
    const options = chart.options();
    const lineY = this.series.priceToCoordinate(hit.line.price) ?? point.y;
    this._gesture = {
      line: hit.line, area: hit.area, rect: hit.rect, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, grabOffsetY: point.y - lineY,
      previousPrice: hit.line.price, dragging: false, handleScroll: snapshot(options.handleScroll), handleScale: snapshot(options.handleScale),
    };
    // Locked from the press (not only from the first move) so a touch pan cannot start before the threshold.
    chart.applyOptions({ handleScroll: false, handleScale: false });
    try { this._container.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    this.requestUpdate();
  };

  private readonly _onPointerMove = (event: PointerEvent): void => {
    if (!this._attached) return;
    const gesture = this._gesture;
    if (gesture === null) { this._updateHover(this._localPoint(event)); return; }
    if (event.pointerId !== gesture.pointerId) return;
    // A mouse button released outside our sight (pointerup lost): do not keep dragging with no button pressed.
    if (event.pointerType === 'mouse' && event.buttons === 0) { this._endGesture(false); return; }
    event.preventDefault();
    if (!gesture.dragging) {
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < DRAG_THRESHOLD) return;
      gesture.dragging = true;
      if (gesture.line.showOrderValue) {
        gesture.orderValueWidth = orderValueWidth(this._publicLine(gesture.line), this._metrics());
      }
      this._dragStarted.fire({ line: this._publicLine(gesture.line) });
      if (this._gesture !== gesture) return; // a subscriber removed the line / ended the gesture
    }
    const point = this._localPoint(event); if (point === null) return;
    const price = this.series.coordinateToPrice(point.y - gesture.grabOffsetY); if (price === null) return;
    gesture.line.price = price; gesture.line.priceLine.applyOptions({ price }); this.requestUpdate();
  };

  private readonly _onPointerUp = (event: PointerEvent): void => {
    const gesture = this._gesture;
    if (gesture === null || event.pointerId !== gesture.pointerId) return;
    event.preventDefault(); this._endGesture(true);
  };

  private readonly _onPointerCancel = (event: PointerEvent): void => {
    if (this._gesture !== null && event.pointerId === this._gesture.pointerId) this._endGesture(false);
  };

  /** `pointerleave` does not bubble but is still seen in the capture phase for every child: only the container's own counts. */
  private readonly _onPointerLeave = (event: PointerEvent): void => {
    if (event.target === this._container && this._gesture === null) this._setHovered(null);
  };

  private readonly _onContextMenu = (event: MouseEvent): void => {
    if (!this._attached) return;
    const point = this._localPoint(event); if (point === null) return;
    event.preventDefault();
    this._endGesture(false); // e.g. ctrl+click on macOS must not leave a pending click behind
    const paneHeight = this.chart.paneSize(this.series.getPane().paneIndex()).height;
    const hit = this._hitAt(point.x, point.y);
    this._contextMenuRequested.fire({
      price: point.y >= 0 && point.y <= paneHeight ? this.series.coordinateToPrice(point.y) : null,
      line: hit === null ? null : this._publicLine(hit.line),
      clientX: event.clientX, clientY: event.clientY,
    });
  };

  private _endGesture(commit: boolean): void {
    const gesture = this._gesture; if (gesture === null) return;
    this._gesture = null;
    try { this._container.releasePointerCapture(gesture.pointerId); } catch { /* not captured */ }
    if (this._attached) this.chart.applyOptions({ handleScroll: gesture.handleScroll as never, handleScale: gesture.handleScale as never });
    if (commit) {
      if (gesture.dragging) {
        if (gesture.line.price !== gesture.previousPrice) this._priceChanged.fire({ line: this._publicLine(gesture.line), previousPrice: gesture.previousPrice });
      } else {
        this._click(gesture);
      }
    } else if (gesture.dragging && this._attached) {
      // Aborted drag: put the line back where it was.
      gesture.line.price = gesture.previousPrice; gesture.line.priceLine.applyOptions({ price: gesture.previousPrice });
    }
    this.requestUpdate();
  }

  private _click(gesture: Gesture): void {
    const line = this._publicLine(gesture.line);
    if (gesture.area === 'quantity' || gesture.area === 'label') {
      this._editRequested.fire({ line, field: gesture.area, anchor: this._anchor(gesture.rect) });
    } else if (gesture.area === 'cancel' || gesture.area === 'confirm') {
      this._actionClicked.fire({ line, action: gesture.area });
    }
  }

  private _updateHover(point: { x: number; y: number } | null): void {
    this._setHovered(point === null ? null : this._hoverAt(point.x, point.y));
  }

  private _setHovered(id: string | null): void {
    if (id === this._hoveredId) return;
    this._hoveredId = id; this.requestUpdate();
  }

  private _isHovered(line: StoredLine): boolean {
    return line.id === this._hoveredId || line.id === this._gesture?.line.id;
  }

  private _metrics(): Metrics {
    const font = this._options.fontFamily ?? DEFAULT_FONT;
    if (this._measureContext === null) this._measureContext = document.createElement('canvas').getContext('2d');
    const context = this._measureContext;
    return {
      measure: (text, fontSize) => {
        if (context === null) return text.length * fontSize * 0.6;
        context.font = `${fontSize}px ${font}`;
        return context.measureText(text).width;
      },
      remPx: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
      fontFamily: font,
      borderRadius: this._options.borderRadius ?? DEFAULT_RADIUS,
      background: this._options.backgroundColor ?? this._chartBackground(),
      // Only looked up when some line actually shows an order value.
      currentPrice: [...this._lines.values()].some(line => line.showOrderValue) ? this._currentPrice() : null,
    };
  }

  /** Last price of the series (`close` for OHLC data, else `value`), the reference of `showOrderValue`. */
  private _currentPrice(): number | null {
    type Item = { value?: unknown; close?: unknown } | null;
    const series = this.series as ISeriesApi<SeriesType>;
    // Cheap lookup of the last bar; a nearest-left search beyond the data returns it. `-1` is `MismatchDirection.NearestLeft` (type-only import).
    let item = series.dataByIndex(Number.MAX_SAFE_INTEGER, -1 as MismatchDirection) as unknown as Item;
    if (item === null || item === undefined) item = (series.data().at(-1) ?? null) as unknown as Item;
    if (item === null) return null;
    const price = typeof item.close === 'number' ? item.close : item.value;
    return typeof price === 'number' && Number.isFinite(price) ? price : null;
  }

  private _chartBackground(): string {
    const background = this.chart.options().layout.background as { type: string; color?: string };
    return background.type === 'solid' && background.color !== undefined ? background.color : FALLBACK_BACKGROUND;
  }

  private _paneWidth(): number { return this.chart.paneSize(this.series.getPane().paneIndex()).width; }

  private _layoutLine(line: StoredLine, y: number, paneWidth: number, metrics: Metrics, hovered: boolean): LineLayout {
    let minimumOrderValueWidth = 0;
    const gesture = this._gesture;
    if (gesture?.line === line && gesture.dragging && line.showOrderValue) {
      const currentWidth = orderValueWidth(this._publicLine(line), metrics);
      gesture.orderValueWidth = Math.max(gesture.orderValueWidth ?? currentWidth, currentWidth);
      minimumOrderValueWidth = gesture.orderValueWidth;
    }
    return layoutLine(this._publicLine(line), y, paneWidth, metrics, hovered, minimumOrderValueWidth);
  }

  private _renderState(): { entries: readonly RenderEntry[]; paneWidth: number; metrics: Metrics } | null {
    if (!this._attached) return null;
    const series = this.series; const paneWidth = this._paneWidth(); const metrics = this._metrics();
    const entries: RenderEntry[] = [];
    for (const stored of this._lines.values()) {
      const y = series.priceToCoordinate(stored.price); if (y === null) continue;
      const line = this._publicLine(stored);
      entries.push({ line, layout: this._layoutLine(stored, y, paneWidth, metrics, this._isHovered(stored)) });
    }
    return { entries, paneWidth, metrics };
  }

  /** Layouts of all interactive lines, topmost (last added) first. `holding` and `temporary` lines are static and never included. */
  private _interactiveLayouts(): { line: StoredLine; layout: LineLayout }[] {
    const series = this.series; const paneWidth = this._paneWidth(); const metrics = this._metrics();
    const layouts: { line: StoredLine; layout: LineLayout }[] = [];
    for (const line of [...this._lines.values()].reverse()) {
      if (line.lineType === 'holding' || line.lineType === 'temporary') continue;
      const lineY = series.priceToCoordinate(line.price); if (lineY === null) continue;
      layouts.push({ line, layout: this._layoutLine(line, lineY, paneWidth, metrics, this._isHovered(line)) });
    }
    return layouts;
  }

  /** Controls of all lines first (last added = topmost), then line bands. Uses the same layout as drawing. */
  private _hitAt(x: number, y: number): Hit | null {
    if (!this._attached) return null;
    const layouts = this._interactiveLayouts();
    for (const { line, layout } of layouts) {
      const control = controlAt(layout, this._publicLine(line), x, y);
      if (control !== null) return { line, ...control };
    }
    for (const { line, layout } of layouts) if (contains(layout.band, x, y)) return { line, area: 'line', rect: layout.band };
    return null;
  }

  /** Id of the line the pointer is over: a hit, or the row between an order's info box and its (hidden) buttons. */
  private _hoverAt(x: number, y: number): string | null {
    if (!this._attached) return null;
    const hit = this._hitAt(x, y);
    if (hit !== null) return hit.line.id;
    for (const { line, layout } of this._interactiveLayouts()) if (layout.region !== null && contains(layout.region, x, y)) return line.id;
    return null;
  }

  private _localPoint(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const rect = this._container.getBoundingClientRect();
    const x = event.clientX - rect.left; const y = event.clientY - rect.top;
    return x < 0 || y < 0 || x > rect.width || y > rect.height ? null : { x, y };
  }

  private _anchor(rect: Rect): InteractivePriceLineAnchor {
    const container = this._container.getBoundingClientRect();
    return { left: container.left + rect.left, top: container.top + rect.top, width: rect.width, height: rect.height };
  }

  private _requireSeries(): ISeriesApi<SeriesType> {
    if (!this._attached) throw new Error('InteractivePriceLines: attach the plugin to a series before adding lines');
    return this.series as ISeriesApi<SeriesType>;
  }

  private _requireLine(id: string): StoredLine {
    const line = this._lines.get(id);
    if (line === undefined) throw new Error(`InteractivePriceLines: no line with id "${id}"`);
    return line;
  }

  private _publicLine(line: StoredLine): InteractivePriceLine {
    const { id, price, lineType, colorPriceLine, colorInfoBoxBorder, fontSize, quantity, label, actions, confirmed } = line;
    const { fontWeightLabel, fontWeightValues, infoBoxLineWidth, infoBoxPaddingH, infoBoxPaddingV, priceLineWidth, backgroundColor, icon, iconFontWeight, iconColor, iconBackground, iconPaddingH, iconPaddingV, iconPosition, iconSize, iconOffset, showOrderValue, showHoldingValueColor } = line;
    return {
      id, price, lineType, colorPriceLine, colorInfoBoxBorder,
      fontColor: line.fontColorOption ?? line.colorPriceLineOption ?? TEXT_COLOR, fontSize,
      fontWeightLabel, fontWeightValues, infoBoxLineWidth, infoBoxPaddingH, infoBoxPaddingV, priceLineWidth, backgroundColor,
      icon, iconFontWeight, iconColor, iconBackground, iconPaddingH, iconPaddingV, iconPosition, iconSize, iconOffset, showOrderValue, showHoldingValueColor,
      quantity, label, actions, confirmed, extraData: { ...line.extraData },
    };
  }
}
