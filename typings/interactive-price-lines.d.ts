import { IPrimitivePaneView, PrimitiveHoveredItem, SeriesAttachedParameter, Time } from 'lightweight-charts';
import { ISubscription } from '@tradingview/lwc-toolkit/delegate';
import { PluginBase } from '@tradingview/lwc-toolkit/plugin-base';
export type InteractivePriceLineAction = 'cancel' | 'confirm';
export type InteractivePriceLineField = 'quantity' | 'label';
export type InteractivePriceLineIconPosition = 'middle' | 'above' | 'below';
/**
 * Immutable after `addLine`.
 * - `order`: draggable, `grip | quantity | label` box, outside `✕` / `✓` buttons.
 * - `alert`: draggable, centred `label | ✕` box (on hover), no quantity, no grip, no outside buttons.
 * - `holding`: static line with an `Owned | amount | abs gain | rel gain` box. No drag, no controls, no events.
 * - `temporary`: a dash-dot line without any controls, box or events. Set (`addLine`) and unset
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
    /** Custom dash lengths in CSS px, separated by spaces or commas. Empty string draws a solid line. */
    lineDash?: string;
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
    /** Position relative to the price line; `above`/`below` overlap its outer stroke edge by half the line width. Default `middle`. */
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
    lineDash: string | undefined;
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
/**
 * A series primitive for annotated price levels. It renders, hit-tests and drags on the
 * chart; the host owns popup editors, context menus and business actions.
 */
export declare class InteractivePriceLines extends PluginBase {
    private readonly _container;
    private readonly _options;
    private readonly _paneViews;
    private readonly _lines;
    private readonly _editRequested;
    private readonly _actionClicked;
    private readonly _priceChanged;
    private readonly _dragStarted;
    private readonly _contextMenuRequested;
    private _attached;
    private _gesture;
    private _hoveredId;
    private _measureContext;
    /** `container` is the chart container and supplies pointer capture for drag gestures. */
    constructor(_container: HTMLElement, _options?: InteractivePriceLinesOptions);
    attached(param: SeriesAttachedParameter<Time>): void;
    detached(): void;
    paneViews(): readonly IPrimitivePaneView[];
    hitTest(x: number, y: number): PrimitiveHoveredItem | null;
    addLine(options: InteractivePriceLineOptions): InteractivePriceLine;
    /** `lineType` is immutable and cannot be patched. */
    updateLine(id: string, patch: Partial<Omit<InteractivePriceLineOptions, 'id' | 'lineType'>>): InteractivePriceLine;
    removeLine(id: string): boolean;
    lines(): readonly InteractivePriceLine[];
    editRequested(): ISubscription<InteractivePriceLineEditRequest>;
    actionClicked(): ISubscription<InteractivePriceLineActionEvent>;
    priceChanged(): ISubscription<InteractivePriceLinePriceChange>;
    /** Fired once when a press turns into a drag (movement beyond the threshold), before the line moves. */
    dragStarted(): ISubscription<InteractivePriceLineDragStart>;
    /** Fired on right click anywhere on the chart; the browser's own context menu is suppressed. */
    contextMenuRequested(): ISubscription<InteractivePriceLineContextMenuEvent>;
    private readonly _onPointerDown;
    private readonly _onPointerMove;
    private readonly _onPointerUp;
    private readonly _onPointerCancel;
    /** `pointerleave` does not bubble but is still seen in the capture phase for every child: only the container's own counts. */
    private readonly _onPointerLeave;
    private readonly _onContextMenu;
    private _endGesture;
    private _click;
    private _updateHover;
    private _setHovered;
    private _isHovered;
    private _metrics;
    /** Last price of the series (`close` for OHLC data, else `value`), the reference of `showOrderValue`. */
    private _currentPrice;
    private _chartBackground;
    private _paneWidth;
    private _layoutLine;
    private _renderState;
    /** Layouts of all interactive lines, topmost (last added) first. `holding` and `temporary` lines are static and never included. */
    private _interactiveLayouts;
    /** Controls of all lines first (last added = topmost), then line bands. Uses the same layout as drawing. */
    private _hitAt;
    /** Id of the line the pointer is over: a hit, or the row between an order's info box and its (hidden) buttons. */
    private _hoverAt;
    private _localPoint;
    private _anchor;
    private _requireSeries;
    private _requireLine;
    private _publicLine;
}
