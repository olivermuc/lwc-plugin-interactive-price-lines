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
/** `alert`: whole-line drag + centred hover `✕`. `order`: full control group. Immutable after `addLine`. */
export type InteractivePriceLineType = 'alert' | 'order';

/** Static styling, resolved by the host (canvas cannot evaluate `var(--x)`). No theme switching. */
export interface InteractivePriceLinesOptions {
	/** Chart background. Fallback: the chart's solid `layout.background`, else `#020305`. */
	backgroundColor?: string;
	/** CSS font-family list used for all control text. */
	fontFamily?: string;
	/** Corner radius of control boxes, in CSS px. Default 6. */
	borderRadius?: number;
}

/** Input used to create a line. `id` belongs to the host application's domain. */
export interface InteractivePriceLineOptions {
	id: string;
	price: number;
	/** Default `'order'`. Immutable: not accepted by `updateLine`. */
	lineType?: InteractivePriceLineType;
	/** Line, border, separator and icon colour. Opaque string, never parsed. */
	color?: string;
	quantity?: string;
	label?: string;
	actions?: readonly InteractivePriceLineAction[];
	/** Orders only. Set by the host (via `updateLine`) after it committed the order. Default `false`. */
	confirmed?: boolean;
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
	quantity: string;
	label: string;
	actions: readonly InteractivePriceLineAction[];
	confirmed: boolean;
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
	/** The line whose control or line band was clicked, else `null`. */
	line: InteractivePriceLine | null;
	clientX: number;
	clientY: number;
}

type HitArea = 'grip' | 'quantity' | 'label' | 'line' | InteractivePriceLineAction;

interface Rect { left: number; top: number; width: number; height: number; }
interface StoredLine extends InteractivePriceLine { priceLine: IPriceLine; }

interface Metrics {
	measure: (text: string) => number;
	remPx: number;
	fontFamily: string;
	borderRadius: number;
	background: string;
}

interface InfoBox { rect: Rect; grip: Rect; quantity: Rect; label: Rect; }
interface LineLayout {
	y: number;
	band: Rect;
	info: InfoBox | null;
	cancel: Rect | null;
	confirm: Rect | null;
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

const ROW_HEIGHT = 22;
const DISK_SIZE = ROW_HEIGHT;
const CONTROL_GAP = 6;
const GRIP_WIDTH = 18;
const SEPARATOR_WIDTH = 1;
const TEXT_PADDING = 8;
const MIN_QUANTITY_WIDTH = 28;
const MIN_LABEL_WIDTH = 22;
const ALERT_BOX_WIDTH = 28;
const FONT_SIZE = 12;
/** Gap between the pane's right edge (price scale) and the order controls. */
const ORDER_RIGHT_OFFSET_REM = 5;
/** The line is draggable within this many CSS px above and below it. */
const LINE_HIT_TOLERANCE = 2;
/** A press that moves less than this many CSS px is a click, otherwise a price drag. */
const DRAG_THRESHOLD = 4;
const END_DOT_RADIUS = 3;
const END_DOT_INSET = 12;
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

function isCancelVisible(line: InteractivePriceLine, hovered: boolean): boolean {
	if (!line.actions.includes('cancel')) return false;
	return line.lineType === 'alert' ? hovered : !line.confirmed || hovered;
}

function isConfirmVisible(line: InteractivePriceLine): boolean {
	return line.lineType === 'order' && !line.confirmed && line.actions.includes('confirm');
}

/**
 * Single geometry source shared by drawing and hit testing (CSS px, pane coordinates).
 * Hidden controls are `null` and therefore neither painted nor hit-testable.
 */
function layoutLine(line: InteractivePriceLine, y: number, paneWidth: number, m: Metrics, hovered: boolean): LineLayout {
	const band: Rect = { left: 0, top: y - LINE_HIT_TOLERANCE, width: paneWidth, height: LINE_HIT_TOLERANCE * 2 };
	const top = y - ROW_HEIGHT / 2;
	const cancelVisible = isCancelVisible(line, hovered);

	if (line.lineType === 'alert') {
		const cancel = cancelVisible
			? { left: Math.round((paneWidth - ALERT_BOX_WIDTH) / 2), top, width: ALERT_BOX_WIDTH, height: ROW_HEIGHT }
			: null;
		return { y, band, info: null, cancel, confirm: null };
	}

	const quantityWidth = Math.max(MIN_QUANTITY_WIDTH, Math.ceil(m.measure(line.quantity)) + TEXT_PADDING * 2);
	const labelWidth = Math.max(MIN_LABEL_WIDTH, Math.ceil(m.measure(line.label)) + TEXT_PADDING * 2);
	const infoWidth = GRIP_WIDTH + quantityWidth + SEPARATOR_WIDTH + labelWidth;
	// The info box is anchored to the right offset and never moves when ✕ / ✓ appear or disappear.
	const infoLeft = Math.max(0, paneWidth - ORDER_RIGHT_OFFSET_REM * m.remPx - infoWidth);
	const grip = { left: infoLeft, top, width: GRIP_WIDTH, height: ROW_HEIGHT };
	const quantity = { left: grip.left + GRIP_WIDTH, top, width: quantityWidth, height: ROW_HEIGHT };
	const label = { left: quantity.left + quantityWidth, top, width: SEPARATOR_WIDTH + labelWidth, height: ROW_HEIGHT };
	const info: InfoBox = { rect: { left: infoLeft, top, width: infoWidth, height: ROW_HEIGHT }, grip, quantity, label };

	let cursor = infoLeft;
	let confirm: Rect | null = null;
	let cancel: Rect | null = null;
	if (isConfirmVisible(line)) {
		cursor -= CONTROL_GAP + DISK_SIZE;
		confirm = { left: cursor, top, width: DISK_SIZE, height: ROW_HEIGHT };
	}
	if (cancelVisible) {
		cursor -= CONTROL_GAP + DISK_SIZE;
		cancel = { left: cursor, top, width: DISK_SIZE, height: ROW_HEIGHT };
	}
	return { y, band, info, cancel, confirm };
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
		if (contains(layout.info.quantity, x, y)) return { area: 'quantity', rect: layout.info.quantity };
		if (contains(layout.info.label, x, y)) return { area: 'label', rect: layout.info.label };
		if (contains(layout.info.grip, x, y)) return { area: 'grip', rect: layout.info.grip };
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
			const text = (value: string, r: Rect, color: string, shift = 0): void => {
				if (value === '') return;
				ctx.fillStyle = color;
				ctx.fillText(value, Math.round((r.left + r.width / 2 + shift) * h), Math.round((r.top + r.height / 2) * v));
			};

			ctx.save();
			ctx.font = `${FONT_SIZE * h}px ${m.fontFamily}`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';

			// Pass 1: all lines, so that every control (pass 2) masks every line beneath it.
			for (const { line, layout } of this._entries) {
				const yy = Math.round(layout.y * v - lw / 2) + lw / 2;
				ctx.strokeStyle = line.color; ctx.fillStyle = line.color; ctx.lineWidth = lw;
				ctx.setLineDash(line.lineType === 'alert' ? [6 * h, 4 * h] : [10 * h, 4 * h, 2 * h, 4 * h]);
				ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(this._paneWidth * h, yy); ctx.stroke();
				ctx.setLineDash([]);
				if (line.lineType === 'order') {
					ctx.beginPath(); ctx.arc((this._paneWidth - END_DOT_INSET) * h, yy, END_DOT_RADIUS * h, 0, Math.PI * 2); ctx.fill();
				}
			}

			// Pass 2: controls. Borders, separators and icons use the line colour; text is white.
			for (const { line, layout } of this._entries) {
				if (layout.info !== null) {
					const { rect, grip, label } = layout.info;
					box(rect, line.color);
					ctx.fillStyle = line.color;
					for (let col = 0; col < 2; col++) for (let row = 0; row < 3; row++) {
						ctx.beginPath();
						ctx.arc((grip.left + grip.width / 2 - 2 + col * 4) * h, (grip.top + grip.height / 2 - 4 + row * 4) * v, 1.1 * h, 0, Math.PI * 2);
						ctx.fill();
					}
					const sepX = Math.round(label.left * h) + lw / 2;
					ctx.beginPath(); ctx.moveTo(sepX, Math.round((rect.top + 4) * v)); ctx.lineTo(sepX, Math.round((rect.top + rect.height - 4) * v));
					ctx.strokeStyle = line.color; ctx.lineWidth = lw; ctx.stroke();
					text(line.quantity, layout.info.quantity, TEXT_COLOR);
					text(line.label, { ...label, left: label.left + SEPARATOR_WIDTH, width: label.width - SEPARATOR_WIDTH }, TEXT_COLOR);
				}
				if (layout.confirm !== null) { disk(layout.confirm, line.color); text('✓', layout.confirm, line.color); }
				if (layout.cancel !== null) {
					if (line.lineType === 'alert') box(layout.cancel, line.color); else disk(layout.cancel, line.color);
					text('✕', layout.cancel, line.color);
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
		const resize = hit.area === 'grip' || hit.area === 'line';
		return { externalId: `${ID_PREFIX}:${hit.line.id}:${hit.area}`, zOrder: 'top', cursorStyle: resize ? 'ns-resize' : 'pointer' };
	}

	public addLine(options: InteractivePriceLineOptions): InteractivePriceLine {
		if (this._lines.has(options.id)) throw new Error(`InteractivePriceLines: duplicate id "${options.id}"`);
		const series = this._requireSeries();
		const color = options.color ?? DEFAULT_COLOR;
		const line: StoredLine = {
			id: options.id, price: options.price, lineType: options.lineType ?? 'order', color,
			quantity: options.quantity ?? '', label: options.label ?? 'Price line', actions: options.actions ?? [],
			confirmed: options.confirmed ?? false,
			// The canvas draws the line itself (so controls can mask it); the native line only provides the axis label.
			priceLine: series.createPriceLine({ id: `${ID_PREFIX}:${options.id}`, price: options.price, color, lineWidth: 1, lineVisible: false, axisLabelVisible: true }),
		};
		this._lines.set(line.id, line); this.requestUpdate(); return this._publicLine(line);
	}

	/** `lineType` is immutable and cannot be patched. */
	public updateLine(id: string, patch: Partial<Omit<InteractivePriceLineOptions, 'id' | 'lineType'>>): InteractivePriceLine {
		if ('lineType' in patch) throw new Error('InteractivePriceLines: `lineType` is immutable');
		const line = this._requireLine(id);
		if (patch.price !== undefined) { line.price = patch.price; line.priceLine.applyOptions({ price: patch.price }); }
		if (patch.color !== undefined) { line.color = patch.color; line.priceLine.applyOptions({ color: patch.color }); }
		if (patch.quantity !== undefined) line.quantity = patch.quantity;
		if (patch.label !== undefined) line.label = patch.label;
		if (patch.actions !== undefined) line.actions = patch.actions;
		if (patch.confirmed !== undefined) line.confirmed = patch.confirmed;
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

	private readonly _onPointerLeave = (): void => {
		if (this._gesture === null) this._setHovered(null);
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
		const hit = point === null ? null : this._hitAt(point.x, point.y);
		this._setHovered(hit === null ? null : hit.line.id);
	}

	private _setHovered(id: string | null): void {
		if (id === this._hoveredId) return;
		this._hoveredId = id; this.requestUpdate();
	}

	private _isHovered(line: InteractivePriceLine): boolean {
		return line.id === this._hoveredId || line.id === this._gesture?.line.id;
	}

	private _metrics(): Metrics {
		const font = this._options.fontFamily ?? DEFAULT_FONT;
		if (this._measureContext === null) this._measureContext = document.createElement('canvas').getContext('2d');
		const context = this._measureContext;
		if (context !== null) context.font = `${FONT_SIZE}px ${font}`;
		return {
			measure: text => context === null ? text.length * 7.2 : context.measureText(text).width,
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
			entries.push({ line, layout: layoutLine(line, y, paneWidth, metrics, this._isHovered(line)) });
		}
		return { entries, paneWidth, metrics };
	}

	/** Controls of all lines first (last added = topmost), then line bands. Uses the same layout as drawing. */
	private _hitAt(x: number, y: number): Hit | null {
		if (!this._attached) return null;
		const series = this.series; const paneWidth = this._paneWidth(); const metrics = this._metrics();
		const layouts: { line: StoredLine; layout: LineLayout }[] = [];
		for (const line of [...this._lines.values()].reverse()) {
			const lineY = series.priceToCoordinate(line.price); if (lineY === null) continue;
			layouts.push({ line, layout: layoutLine(line, lineY, paneWidth, metrics, this._isHovered(line)) });
		}
		for (const { line, layout } of layouts) {
			const control = controlAt(layout, line, x, y);
			if (control !== null) return { line, ...control };
		}
		for (const { line, layout } of layouts) if (contains(layout.band, x, y)) return { line, area: 'line', rect: layout.band };
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

	private _publicLine(line: InteractivePriceLine): InteractivePriceLine {
		const { id, price, lineType, color, quantity, label, actions, confirmed } = line;
		return { id, price, lineType, color, quantity, label, actions, confirmed };
	}
}
