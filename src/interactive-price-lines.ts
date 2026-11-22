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

/** Input used to create a line. `id` belongs to the host application's domain. */
export interface InteractivePriceLineOptions {
	id: string;
	price: number;
	color?: string;
	quantity?: string;
	label?: string;
	actions?: readonly InteractivePriceLineAction[];
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
	color: string;
	quantity: string;
	label: string;
	actions: readonly InteractivePriceLineAction[];
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

type HitArea = 'handle' | 'quantity' | 'label' | InteractivePriceLineAction;

interface Rect { left: number; top: number; width: number; height: number; }
interface StoredLine extends InteractivePriceLine { priceLine: IPriceLine; }
interface Drag { line: StoredLine; previousPrice: number; handleScroll: unknown; handleScale: unknown; }

const ROW_HEIGHT = 22;
const HANDLE_RADIUS = 10;
const GAP = 8;
const DEFAULT_COLOR = '#F23645';

function contains(rect: Rect, x: number, y: number): boolean {
	return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

function textWidth(text: string): number {
	return Math.max(22, Math.ceil(text.length * 7.2 + 16));
}

function lineRects(line: InteractivePriceLine, y: number, paneWidth: number): Record<HitArea, Rect> {
	const actionWidth = 24;
	const labelWidth = textWidth(line.label);
	const quantityWidth = line.quantity === '' ? 0 : textWidth(line.quantity);
	const actionCount = line.actions.length;
	const totalWidth = HANDLE_RADIUS * 2 + GAP + quantityWidth + labelWidth + actionCount * actionWidth;
	let left = Math.max(HANDLE_RADIUS, paneWidth - totalWidth - 8);
	const handle = { left, top: y - HANDLE_RADIUS, width: HANDLE_RADIUS * 2, height: HANDLE_RADIUS * 2 };
	left += HANDLE_RADIUS * 2 + GAP;
	const quantity = { left, top: y - ROW_HEIGHT / 2, width: quantityWidth, height: ROW_HEIGHT };
	left += quantityWidth;
	const label = { left, top: y - ROW_HEIGHT / 2, width: labelWidth, height: ROW_HEIGHT };
	left += labelWidth;
	const cancel = { left, top: y - ROW_HEIGHT / 2, width: actionWidth, height: ROW_HEIGHT };
	const confirm = { left: left + (line.actions.includes('cancel') ? actionWidth : 0), top: y - ROW_HEIGHT / 2, width: actionWidth, height: ROW_HEIGHT };
	return { handle, quantity, label, cancel, confirm };
}

class LinesRenderer implements IPrimitivePaneRenderer {
	public constructor(private readonly _lines: readonly { line: InteractivePriceLine; y: number; width: number }[]) {}

	public draw(target: CanvasRenderingTarget2D): void {
		target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: h, verticalPixelRatio: v }) => {
			ctx.font = `${12 * h}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
			for (const entry of this._lines) {
				const { line, y, width } = entry;
				const rects = lineRects(line, y, width);
				const yy = Math.round(y * v) + 0.5;
				ctx.save();
				ctx.strokeStyle = line.color;
				ctx.lineWidth = Math.max(1, h);
				ctx.setLineDash([4 * h, 4 * h]);
				ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(width * h, yy); ctx.stroke(); ctx.setLineDash([]);
				const drawBox = (rect: Rect, fill: string, text: string): void => {
					if (rect.width === 0) return;
					ctx.fillStyle = fill;
					ctx.fillRect(Math.round(rect.left * h), Math.round(rect.top * v), Math.round(rect.width * h), Math.round(rect.height * v));
					if (text !== '') { ctx.fillStyle = '#FFFFFF'; ctx.fillText(text, Math.round((rect.left + 8) * h), Math.round((rect.top + 15) * v)); }
				};
				ctx.fillStyle = '#101014'; ctx.beginPath(); ctx.arc((rects.handle.left + HANDLE_RADIUS) * h, y * v, HANDLE_RADIUS * h, 0, Math.PI * 2); ctx.fill();
				ctx.strokeStyle = line.color; ctx.stroke();
				drawBox(rects.quantity, '#A71D31', line.quantity);
				drawBox(rects.label, line.color, line.label);
				if (line.actions.includes('cancel')) drawBox(rects.cancel, '#3C4048', '×');
				if (line.actions.includes('confirm')) drawBox(rects.confirm, '#089981', '✓');
				ctx.restore();
			}
		});
	}
}

class LinesPaneView implements IPrimitivePaneView {
	public constructor(private readonly _state: () => readonly { line: InteractivePriceLine; y: number; width: number }[]) {}
	public zOrder(): PrimitivePaneViewZOrder { return 'top'; }
	public renderer(): IPrimitivePaneRenderer { return new LinesRenderer(this._state()); }
}

/**
 * A series primitive for annotated price levels. It renders and drags on the
 * chart; the host owns popup editors and business actions.
 */
export class InteractivePriceLines extends PluginBase {
	private readonly _paneViews: readonly IPrimitivePaneView[] = [new LinesPaneView(() => this._renderState())];
	private readonly _lines = new Map<string, StoredLine>();
	private readonly _editRequested = new Delegate<InteractivePriceLineEditRequest>();
	private readonly _actionClicked = new Delegate<InteractivePriceLineActionEvent>();
	private readonly _priceChanged = new Delegate<InteractivePriceLinePriceChange>();
	private _attached = false;
	private _drag: Drag | null = null;

	/** `container` is the chart container and supplies pointer capture for drag gestures. */
	public constructor(private readonly _container: HTMLElement) { super(); }

	public override attached(param: SeriesAttachedParameter<Time>): void {
		super.attached(param);
		this._attached = true;
		this._container.addEventListener('pointerdown', this._onPointerDown, true);
		this._container.addEventListener('pointermove', this._onPointerMove, true);
		this._container.addEventListener('pointerup', this._onPointerUp, true);
		this._container.addEventListener('pointercancel', this._onPointerCancel, true);
	}

	public override detached(): void {
		this._finishDrag(false);
		this._container.removeEventListener('pointerdown', this._onPointerDown, true);
		this._container.removeEventListener('pointermove', this._onPointerMove, true);
		this._container.removeEventListener('pointerup', this._onPointerUp, true);
		this._container.removeEventListener('pointercancel', this._onPointerCancel, true);
		for (const line of this._lines.values()) this.series.removePriceLine(line.priceLine);
		this._lines.clear(); this._attached = false;
		super.detached();
	}

	public paneViews(): readonly IPrimitivePaneView[] { return this._paneViews; }

	public hitTest(x: number, y: number): PrimitiveHoveredItem | null {
		const hit = this._hitAt(x, y);
		return hit === null ? null : { externalId: `interactive-price-lines:${hit.line.id}:${hit.area}`, zOrder: 'top', cursorStyle: hit.area === 'handle' ? 'ns-resize' : 'pointer' };
	}

	public addLine(options: InteractivePriceLineOptions): InteractivePriceLine {
		if (this._lines.has(options.id)) throw new Error(`InteractivePriceLines: duplicate id \"${options.id}\"`);
		const series = this._requireSeries();
		const line: StoredLine = {
			id: options.id, price: options.price, color: options.color ?? DEFAULT_COLOR,
			quantity: options.quantity ?? '', label: options.label ?? 'Price line', actions: options.actions ?? [],
			priceLine: series.createPriceLine({ id: `interactive-price-lines:${options.id}`, price: options.price, color: options.color ?? DEFAULT_COLOR, lineWidth: 1, axisLabelVisible: true }),
		};
		this._lines.set(line.id, line); this.requestUpdate(); return this._publicLine(line);
	}

	public updateLine(id: string, patch: Partial<Omit<InteractivePriceLineOptions, 'id'>>): InteractivePriceLine {
		const line = this._requireLine(id);
		if (patch.price !== undefined) { line.price = patch.price; line.priceLine.applyOptions({ price: patch.price }); }
		if (patch.color !== undefined) { line.color = patch.color; line.priceLine.applyOptions({ color: patch.color }); }
		if (patch.quantity !== undefined) line.quantity = patch.quantity;
		if (patch.label !== undefined) line.label = patch.label;
		if (patch.actions !== undefined) line.actions = patch.actions;
		this.requestUpdate(); return this._publicLine(line);
	}

	public removeLine(id: string): boolean { const line = this._lines.get(id); if (line === undefined) return false; if (this._attached) this.series.removePriceLine(line.priceLine); this._lines.delete(id); this.requestUpdate(); return true; }
	public lines(): readonly InteractivePriceLine[] { return [...this._lines.values()].map(line => this._publicLine(line)); }
	public editRequested(): ISubscription<InteractivePriceLineEditRequest> { return this._editRequested; }
	public actionClicked(): ISubscription<InteractivePriceLineActionEvent> { return this._actionClicked; }
	public priceChanged(): ISubscription<InteractivePriceLinePriceChange> { return this._priceChanged; }

	private readonly _onPointerDown = (event: PointerEvent): void => {
		if (event.button !== 0) return;
		const point = this._localPoint(event); if (point === null) return;
		const hit = this._hitAt(point.x, point.y); if (hit === null) return;
		event.preventDefault(); event.stopPropagation();
		if (hit.area === 'handle') {
			if (!this._attached) return;
			const chart = this.chart;
			const options = chart.options();
			this._drag = { line: hit.line, previousPrice: hit.line.price, handleScroll: options.handleScroll, handleScale: options.handleScale };
			chart.applyOptions({ handleScroll: false, handleScale: false });
			this._container.setPointerCapture(event.pointerId);
			return;
		}
		if (hit.area === 'quantity' || hit.area === 'label') this._editRequested.fire({ line: this._publicLine(hit.line), field: hit.area, anchor: this._anchor(hit.rect) });
		else this._actionClicked.fire({ line: this._publicLine(hit.line), action: hit.area });
	};

	private readonly _onPointerMove = (event: PointerEvent): void => {
		if (!this._attached) return;
		const drag = this._drag; const series = this.series; if (drag === null) return;
		const point = this._localPoint(event); if (point === null) return;
		const price = series.coordinateToPrice(point.y); if (price === null) return;
		drag.line.price = price; drag.line.priceLine.applyOptions({ price }); this.requestUpdate(); event.preventDefault();
	};

	private readonly _onPointerUp = (event: PointerEvent): void => { if (this._drag === null) return; event.preventDefault(); this._finishDrag(true); };
	private readonly _onPointerCancel = (): void => this._finishDrag(false);

	private _finishDrag(report: boolean): void {
		const drag = this._drag; if (drag === null) return;
		this._drag = null;
		if (this._attached) this.chart.applyOptions({ handleScroll: drag.handleScroll as never, handleScale: drag.handleScale as never });
		if (report && drag.line.price !== drag.previousPrice) this._priceChanged.fire({ line: this._publicLine(drag.line), previousPrice: drag.previousPrice });
	}

	private _renderState(): readonly { line: InteractivePriceLine; y: number; width: number }[] {
		if (!this._attached) return [];
		const series = this.series; const chart = this.chart;
		const width = chart.paneSize(series.getPane().paneIndex()).width;
		return [...this._lines.values()].flatMap(line => { const y = series.priceToCoordinate(line.price); return y === null ? [] : [{ line: this._publicLine(line), y, width }]; });
	}

	private _hitAt(x: number, y: number): { line: StoredLine; area: HitArea; rect: Rect } | null {
		if (!this._attached) return null;
		const series = this.series; const chart = this.chart;
		const width = chart.paneSize(series.getPane().paneIndex()).width;
		for (const line of [...this._lines.values()].reverse()) {
			const lineY = series.priceToCoordinate(line.price); if (lineY === null) continue;
			const rects = lineRects(line, lineY, width);
			for (const area of ['confirm', 'cancel', 'quantity', 'label', 'handle'] as const) if ((area !== 'confirm' || line.actions.includes(area)) && (area !== 'cancel' || line.actions.includes(area)) && contains(rects[area], x, y)) return { line, area, rect: rects[area] };
		}
		return null;
	}

	private _localPoint(event: PointerEvent): { x: number; y: number } | null { const rect = this._container.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top; return x < 0 || y < 0 || x > rect.width || y > rect.height ? null : { x, y }; }
	private _anchor(rect: Rect): InteractivePriceLineAnchor { const container = this._container.getBoundingClientRect(); return { left: container.left + rect.left, top: container.top + rect.top, width: rect.width, height: rect.height }; }
	private _requireSeries(): ISeriesApi<SeriesType> { if (!this._attached) throw new Error('InteractivePriceLines: attach the plugin to a series before adding lines'); return this.series as ISeriesApi<SeriesType>; }
	private _requireLine(id: string): StoredLine { const line = this._lines.get(id); if (line === undefined) throw new Error(`InteractivePriceLines: no line with id \"${id}\"`); return line; }
	private _publicLine(line: StoredLine): InteractivePriceLine { const { priceLine: _priceLine, ...result } = line; return result; }
}
