import { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
	IPrimitivePaneRenderer,
	IPrimitivePaneView,
	IPriceLine,
	ISeriesApi,
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
/**
 * Immutable after `addLine`.
 * - `order`: draggable, `grip | quantity | label` box, outside `✕` / `✓` buttons.
 * - `alert`: draggable, centred `label | ✕` box (on hover), no quantity, no grip, no outside buttons.
 * - `holding`: static line with an `Owned | amount | abs gain | rel gain` box. No drag, no controls, no events.
 */
export type InteractivePriceLineType = 'alert' | 'order' | 'holding';

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
	/** Line, border, separator and icon colour. Opaque string, never parsed. */
	color?: string;
	/** Colour of the quantity / label text. Fallback: `color`, else `#fff`. */
	fontColor?: string;
	/** Size of the control text in CSS px. The row height scales with it. Default 12. */
	fontSize?: number;
	/** Orders only; ignored by `alert` and `holding`. */
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
	color: string;
	/** Resolved: the explicit `fontColor`, else `color` if one was passed, else `#fff`. */
	fontColor: string;
	fontSize: number;
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
	/** `color` as passed by the host (undefined → default colour, and the text does not inherit it). */
	colorOption: string | undefined;
	fontColorOption: string | undefined;
}

interface Metrics {
	measure: (text: string, fontSize: number) => number;
	remPx: number;
	fontFamily: string;
	borderRadius: number;
	background: string;
}

interface InfoBox {
	rect: Rect;
	/** Orders: drag-only handle with dots. Alerts: the label segment (drag only). */
	grip: Rect | null;
	/** Orders only. */
	quantity: Rect | null;
	/** Hit area of the label segment (includes its separator); orders only, it opens the editor. */
	label: Rect | null;
	/** All texts with the rect they are centred in. */
	texts: { text: string; rect: Rect }[];
	/** x of each separator line. */
	separators: number[];
	/** Draw the grip dots. */
	dots: boolean;
}
interface LineLayout {
	y: number;
	band: Rect;
	info: InfoBox | null;
	cancel: Rect | null;
	confirm: Rect | null;
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
	handleScroll: unknown;
	handleScale: unknown;
}

const BASE_FONT_SIZE = 12;
/** Row height at `BASE_FONT_SIZE`; scales proportionally with `fontSize`. */
const BASE_ROW_HEIGHT = 22;
const CONTROL_GAP = 6;
const GRIP_WIDTH = 18;
const SEPARATOR_WIDTH = 1;
/** Left and right margin between a box border / the separator and the text next to it. */
const TEXT_PADDING = 8;
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
/** Last resort text colour, when neither `fontColor` nor `color` is passed. */
const TEXT_COLOR = '#fff';
const FALLBACK_BACKGROUND = '#020305';
const DEFAULT_COLOR = '#F23645';
const DEFAULT_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const DEFAULT_RADIUS = 6;
const ID_PREFIX = 'interactive-price-lines';

function contains(rect: Rect, x: number, y: number): boolean {
	return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

function containsDisk(rect: Rect, x: number, y: number): boolean {
	const radius = rect.width / 2;
	return Math.hypot(x - (rect.left + radius), y - (rect.top + rect.height / 2)) <= radius;
}

function rowHeightFor(fontSize: number): number {
	return Math.round(fontSize * BASE_ROW_HEIGHT / BASE_FONT_SIZE);
}

function checkFontSize(fontSize: number): number {
	if (!Number.isFinite(fontSize) || fontSize <= 0) throw new Error('InteractivePriceLines: `fontSize` must be a positive number');
	return fontSize;
}

/** Text width plus the same margin on both sides; empty segments get a minimum width. */
function segmentWidth(text: string, fontSize: number, minWidth: number, m: Metrics): number {
	return text === '' ? minWidth : Math.ceil(m.measure(text, fontSize)) + TEXT_PADDING * 2;
}

/**
 * Single geometry source shared by drawing and hit testing (CSS px, pane coordinates).
 * Hidden controls are `null` and therefore neither painted nor hit-testable.
 * Orders: `✓` while unconfirmed, `✕` while unconfirmed or hovered. Alerts: the whole box only while hovered.
 */
function layoutLine(line: InteractivePriceLine, y: number, paneWidth: number, m: Metrics, hovered: boolean): LineLayout {
	const rowHeight = rowHeightFor(line.fontSize);
	const band: Rect = { left: 0, top: y - LINE_HIT_TOLERANCE, width: paneWidth, height: LINE_HIT_TOLERANCE * 2 };
	const top = y - rowHeight / 2;
	const rightEdge = paneWidth - RIGHT_OFFSET_REM * m.remPx;
	const seg = (left: number, width: number): Rect => ({ left, top, width, height: rowHeight });

	if (line.lineType === 'alert') {
		// border | pad label pad | separator | ✕ | border, centred in the pane. Needs `cancel` for the ✕ segment.
		if (!hovered) return { y, band, info: null, cancel: null, confirm: null, region: null };
		const hasCancel = line.actions.includes('cancel');
		const labelWidth = segmentWidth(line.label, line.fontSize, MIN_LABEL_WIDTH, m);
		const cancelWidth = hasCancel ? SEPARATOR_WIDTH + rowHeight : 0;
		const width = labelWidth + cancelWidth;
		const left = Math.round((paneWidth - width) / 2);
		const grip = seg(left, labelWidth);
		const cancel = hasCancel ? seg(left + labelWidth + SEPARATOR_WIDTH, rowHeight) : null;
		const info: InfoBox = {
			rect: seg(left, width), grip, quantity: null, label: null, dots: false,
			texts: [{ text: line.label, rect: grip }], separators: hasCancel ? [left + labelWidth] : [],
		};
		return { y, band, info, cancel, confirm: null, region: null };
	}

	if (line.lineType === 'holding') {
		// `Owned: amount | abs gain | rel gain`: the amount shares the first segment with the label; absent / empty values are skipped.
		const { holdingAmount, holdingAbsGain, holdingRelGain } = line.extraData;
		const present = (value: string | number | undefined): value is string | number => value !== undefined && String(value) !== '';
		const texts = [present(holdingAmount) ? `${line.label}: ${holdingAmount}` : line.label]
			.concat([holdingAbsGain, holdingRelGain].filter(present).map(String));
		const widths = texts.map(text => segmentWidth(text, line.fontSize, MIN_LABEL_WIDTH, m));
		const total = widths.reduce((sum, width) => sum + width, 0) + SEPARATOR_WIDTH * (texts.length - 1);
		let cursor = Math.max(0, rightEdge - total);
		const rect = seg(cursor, total);
		const separators: number[] = [];
		const placed = texts.map((text, index) => {
			if (index > 0) { separators.push(cursor); cursor += SEPARATOR_WIDTH; }
			const r = seg(cursor, widths[index]); cursor += widths[index]; return { text, rect: r };
		});
		return { y, band, info: { rect, grip: null, quantity: null, label: null, dots: false, texts: placed, separators }, cancel: null, confirm: null, region: null };
	}

	// grip | pad quantity pad | separator | pad label pad | border: text margins are all TEXT_PADDING.
	const quantityWidth = segmentWidth(line.quantity, line.fontSize, MIN_QUANTITY_WIDTH, m);
	const labelWidth = segmentWidth(line.label, line.fontSize, MIN_LABEL_WIDTH, m);
	const infoWidth = GRIP_WIDTH + quantityWidth + SEPARATOR_WIDTH + labelWidth;
	// The info box is anchored to the right offset and never moves when ✕ / ✓ appear or disappear.
	const infoLeft = Math.max(0, rightEdge - infoWidth);
	const grip = seg(infoLeft, GRIP_WIDTH);
	const quantity = seg(infoLeft + GRIP_WIDTH, quantityWidth);
	const label = seg(quantity.left + quantityWidth, SEPARATOR_WIDTH + labelWidth);
	const labelText = seg(label.left + SEPARATOR_WIDTH, labelWidth);
	const info: InfoBox = {
		rect: seg(infoLeft, infoWidth), grip, quantity, label, dots: true,
		texts: [{ text: line.quantity, rect: quantity }, { text: line.label, rect: labelText }], separators: [label.left],
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
	return { y, band, info, cancel, confirm, region: seg(cursor, infoLeft + infoWidth - cursor) };
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
	) {}

	public draw(target: CanvasRenderingTarget2D): void {
		target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: h, verticalPixelRatio: v }) => {
			const m = this._metrics;
			const lw = Math.max(1, Math.round(h));
			const snap = (r: Rect): { x: number; y: number; w: number; h: number } => {
				const x0 = Math.round(r.left * h); const y0 = Math.round(r.top * v);
				return { x: x0, y: y0, w: Math.round((r.left + r.width) * h) - x0, h: Math.round((r.top + r.height) * v) - y0 };
			};
			const path = (r: Rect, radius: number, inset: number): void => {
				const s = snap(r);
				ctx.beginPath();
				ctx.roundRect(s.x + inset, s.y + inset, s.w - inset * 2, s.h - inset * 2, Math.max(0, radius * h - inset));
			};
			// Masks whatever is beneath (the line) with the chart background, then draws a crisp 1px border.
			const box = (r: Rect, color: string, radius = m.borderRadius): void => {
				path(r, radius, 0); ctx.fillStyle = m.background; ctx.fill();
				path(r, radius, lw / 2); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
			};
			const disk = (r: Rect, color: string): void => box(r, color, r.width / 2);
			const text = (value: string, r: Rect, color: string, fontSize: number): void => {
				if (value === '') return;
				ctx.font = `${fontSize * h}px ${m.fontFamily}`;
				ctx.fillStyle = color;
				ctx.fillText(value, Math.round((r.left + r.width / 2) * h), Math.round((r.top + r.height / 2) * v));
			};

			ctx.save();
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';

			// Pass 1: all lines, so that every control (pass 2) masks every line beneath it.
			for (const { line, layout } of this._entries) {
				const yy = Math.round(layout.y * v - lw / 2) + lw / 2;
				ctx.strokeStyle = line.color; ctx.fillStyle = line.color; ctx.lineWidth = lw;
				ctx.setLineDash(
					line.lineType === 'alert' ? [6 * h, 4 * h]
						: line.lineType === 'holding' ? [2 * h, 3 * h]
							: [10 * h, 4 * h, 2 * h, 4 * h]
				);
				ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(this._paneWidth * h, yy); ctx.stroke();
				ctx.setLineDash([]);
				if (line.lineType === 'order') {
					ctx.beginPath(); ctx.arc((this._paneWidth - END_DOT_INSET) * h, yy, END_DOT_RADIUS * h, 0, Math.PI * 2); ctx.fill();
				}
			}

			// Pass 2: controls. Borders, separators, dots and icons use the line colour; texts use `fontColor`.
			for (const { line, layout } of this._entries) {
				if (layout.info !== null) {
					const { rect, grip, dots, texts, separators } = layout.info;
					box(rect, line.color);
					const inset = Math.round(rect.height * 4 / BASE_ROW_HEIGHT);
					if (dots && grip !== null) {
						ctx.fillStyle = line.color;
						for (let col = 0; col < 2; col++) for (let row = 0; row < 3; row++) {
							ctx.beginPath();
							ctx.arc((grip.left + grip.width / 2 - 2 + col * 4) * h, (grip.top + grip.height / 2 - 4 + row * 4) * v, 1.1 * h, 0, Math.PI * 2);
							ctx.fill();
						}
					}
					for (const x of separators) {
						const sepX = Math.round(x * h) + lw / 2;
						ctx.beginPath(); ctx.moveTo(sepX, Math.round((rect.top + inset) * v)); ctx.lineTo(sepX, Math.round((rect.top + rect.height - inset) * v));
						ctx.strokeStyle = line.color; ctx.lineWidth = lw; ctx.stroke();
					}
					for (const { text: value, rect: r } of texts) text(value, r, line.fontColor, line.fontSize);
				}
				if (layout.confirm !== null) { disk(layout.confirm, line.color); text('✓', layout.confirm, line.color, line.fontSize); }
				if (layout.cancel !== null) {
					if (line.lineType !== 'alert') disk(layout.cancel, line.color);
					text('✕', layout.cancel, line.color, line.fontSize);
				}
			}
			ctx.restore();
		});
	}
}

class LinesPaneView implements IPrimitivePaneView {
	public constructor(private readonly _state: () => { entries: readonly RenderEntry[]; paneWidth: number; metrics: Metrics } | null) {}
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
		const color = options.color ?? DEFAULT_COLOR;
		const fontSize = checkFontSize(options.fontSize ?? BASE_FONT_SIZE);
		const line: StoredLine = {
			id: options.id, price: options.price, lineType: options.lineType ?? 'order', color, fontSize,
			colorOption: options.color, fontColorOption: options.fontColor,
			quantity: options.quantity ?? '', actions: options.actions ?? [], confirmed: options.confirmed ?? false,
			label: options.label ?? (options.lineType === 'holding' ? 'Owned' : 'Price line'), extraData: { ...options.extraData },
			// The canvas draws the line itself (so controls can mask it); the native line only provides the axis label.
			priceLine: series.createPriceLine({ id: `${ID_PREFIX}:${options.id}`, price: options.price, color, lineWidth: 1, lineVisible: false, axisLabelVisible: true }),
		};
		this._lines.set(line.id, line); this.requestUpdate(); return this._publicLine(line);
	}

	/** `lineType` is immutable and cannot be patched. */
	public updateLine(id: string, patch: Partial<Omit<InteractivePriceLineOptions, 'id' | 'lineType'>>): InteractivePriceLine {
		if ('lineType' in patch) throw new Error('InteractivePriceLines: `lineType` is immutable');
		const line = this._requireLine(id);
		if (patch.fontSize !== undefined) checkFontSize(patch.fontSize);
		if (patch.price !== undefined) { line.price = patch.price; line.priceLine.applyOptions({ price: patch.price }); }
		if (patch.color !== undefined) { line.color = patch.color; line.colorOption = patch.color; line.priceLine.applyOptions({ color: patch.color }); }
		if (patch.fontColor !== undefined) line.fontColorOption = patch.fontColor;
		if (patch.fontSize !== undefined) line.fontSize = patch.fontSize;
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
	/** Fired on right click anywhere on the chart; the browser's own context menu is suppressed. */
	public contextMenuRequested(): ISubscription<InteractivePriceLineContextMenuEvent> { return this._contextMenuRequested; }

	// Gesture model: press arms, movement beyond DRAG_THRESHOLD starts a price drag, release without it is a click.
	private readonly _onPointerDown = (event: PointerEvent): void => {
		if (event.button !== 0 || this._gesture !== null || !this._attached) return;
		const point = this._localPoint(event); if (point === null) return;
		const hit = this._hitAt(point.x, point.y); if (hit === null) return;
		event.preventDefault(); event.stopPropagation();
		const chart = this.chart;
		const options = chart.options();
		const lineY = this.series.priceToCoordinate(hit.line.price) ?? point.y;
		this._gesture = {
			line: hit.line, area: hit.area, rect: hit.rect, pointerId: event.pointerId,
			startX: event.clientX, startY: event.clientY, grabOffsetY: point.y - lineY,
			previousPrice: hit.line.price, dragging: false, handleScroll: options.handleScroll, handleScale: options.handleScale,
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
		event.preventDefault();
		if (!gesture.dragging) {
			if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < DRAG_THRESHOLD) return;
			gesture.dragging = true;
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
		};
	}

	private _chartBackground(): string {
		const background = this.chart.options().layout.background as { type: string; color?: string };
		return background.type === 'solid' && background.color !== undefined ? background.color : FALLBACK_BACKGROUND;
	}

	private _paneWidth(): number { return this.chart.paneSize(this.series.getPane().paneIndex()).width; }

	private _renderState(): { entries: readonly RenderEntry[]; paneWidth: number; metrics: Metrics } | null {
		if (!this._attached) return null;
		const series = this.series; const paneWidth = this._paneWidth(); const metrics = this._metrics();
		const entries: RenderEntry[] = [];
		for (const stored of this._lines.values()) {
			const y = series.priceToCoordinate(stored.price); if (y === null) continue;
			const line = this._publicLine(stored);
			entries.push({ line, layout: layoutLine(line, y, paneWidth, metrics, this._isHovered(stored)) });
		}
		return { entries, paneWidth, metrics };
	}

	/** Layouts of all interactive lines, topmost (last added) first. `holding` lines are static and never included. */
	private _interactiveLayouts(): { line: StoredLine; layout: LineLayout }[] {
		const series = this.series; const paneWidth = this._paneWidth(); const metrics = this._metrics();
		const layouts: { line: StoredLine; layout: LineLayout }[] = [];
		for (const line of [...this._lines.values()].reverse()) {
			if (line.lineType === 'holding') continue;
			const lineY = series.priceToCoordinate(line.price); if (lineY === null) continue;
			layouts.push({ line, layout: layoutLine(this._publicLine(line), lineY, paneWidth, metrics, this._isHovered(line)) });
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
		const { id, price, lineType, color, fontSize, quantity, label, actions, confirmed } = line;
		return { id, price, lineType, color, fontColor: line.fontColorOption ?? line.colorOption ?? TEXT_COLOR, fontSize, quantity, label, actions, confirmed, extraData: { ...line.extraData } };
	}
}
