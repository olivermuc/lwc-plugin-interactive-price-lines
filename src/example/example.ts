import { ColorType, LineSeries, Time, createChart } from 'lightweight-charts';
import {
	InteractivePriceLines,
	type InteractivePriceLineAnchor,
	type InteractivePriceLineOptions,
} from '../interactive-price-lines';

// Canvas cannot evaluate `var(--x)`: resolve host tokens to plain strings, as the host does.
const token = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const BACKGROUND = token('--bg-0');
const DEMO_COLORS = {
	alert: token('--yellow'),
	buy: token('--green'),
	sell: token('--red'),
	trailing: token('--orange'),
	sellLimit: token('--accent'),
	holding: token('--text-secondary'),
};
const FONT_COLOR = token('--text-primary');

// Host responsibility: the holding label carries abs and % distance to the current price and must be re-sent on every tick.
const CURRENT_PRICE = 100 + Math.sin(79 / 5) * 10;
const holdingLabel = (price: number): string => {
	const distance = CURRENT_PRICE - price;
	const sign = distance >= 0 ? '+' : '−';
	return `BE ${price.toFixed(2)}  ${sign}${Math.abs(distance).toFixed(2)} (${sign}${Math.abs(distance / price * 100).toFixed(2)}%)`;
};

export const DEMO_LINES: InteractivePriceLineOptions[] = [
	{ id: 'alert', price: 102.5, color: DEMO_COLORS.alert, fontColor: FONT_COLOR, label: 'Alert', quantity: '', actions: ['cancel'], lineType: 'alert' },
	{ id: 'buy-limit', price: 96.5, color: DEMO_COLORS.buy, fontColor: FONT_COLOR, label: 'Buy Limit', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: false },
	{ id: 'buy-stop', price: 105, color: DEMO_COLORS.buy, fontColor: FONT_COLOR, label: 'Buy Stop', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: true },
	{ id: 'sell-stop-loss', price: 94, color: DEMO_COLORS.sell, fontColor: FONT_COLOR, label: 'Stop Loss', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: true },
	{ id: 'sell-trailing-stop', price: 91.5, color: DEMO_COLORS.trailing, fontColor: FONT_COLOR, label: 'Trailing Stop', quantity: '', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: false },
	{ id: 'sell-limit', price: 108, color: DEMO_COLORS.sellLimit, fontColor: FONT_COLOR, label: 'Sell Limit', quantity: '4', actions: ['cancel', 'confirm'], lineType: 'order', confirmed: true },
	{ id: 'holding', price: 97.8, color: DEMO_COLORS.holding, fontColor: FONT_COLOR, label: holdingLabel(97.8), lineType: 'holding' },
];

const container = document.getElementById('chart') as HTMLElement;
const chart = createChart(container, {
	autoSize: true,
	layout: { background: { type: ColorType.Solid, color: BACKGROUND }, textColor: token('--text-secondary'), fontFamily: token('--sans') },
	grid: { vertLines: { color: token('--hairline') }, horzLines: { color: token('--hairline') } },
});
const series = chart.addSeries(LineSeries, { color: '#2962FF' });
series.setData(Array.from({ length: 80 }, (_, index) => ({ time: (1704067200 + index * 86400) as unknown as Time, value: 100 + Math.sin(index / 5) * 10 })));
chart.timeScale().fitContent();

const lines = new InteractivePriceLines(container, {
	backgroundColor: BACKGROUND,
	fontFamily: token('--sans'),
	borderRadius: parseFloat(token('--radius-sm')),
});
series.attachPrimitive(lines);
for (const options of DEMO_LINES) lines.addLine(options);

// --- Host-owned editor (quantity / label / target price) ---
const editor = document.getElementById('editor') as HTMLFormElement;
const input = document.getElementById('value') as HTMLInputElement;
let commitEdit: ((value: string) => void) | null = null;

function openEditor(anchor: InteractivePriceLineAnchor, value: string, commit: (value: string) => void): void {
	commitEdit = commit;
	input.value = value;
	editor.style.left = `${anchor.left}px`;
	editor.style.top = `${anchor.top + anchor.height + 4}px`;
	editor.style.display = 'flex';
	input.focus(); input.select();
}
editor.addEventListener('submit', event => {
	event.preventDefault();
	commitEdit?.(input.value);
	commitEdit = null; editor.style.display = 'none';
});

lines.editRequested().subscribe(({ line, field, anchor }) => {
	openEditor(anchor, line[field], value => lines.updateLine(line.id, { [field]: value }));
});

// --- Host-owned business actions ---
lines.actionClicked().subscribe(({ line, action }) => {
	console.log(`${action}: ${line.id}`);
	if (action === 'cancel') lines.removeLine(line.id);
	// Simulated order commit; the plugin never sets `confirmed` itself.
	else lines.updateLine(line.id, { confirmed: true });
});
lines.priceChanged().subscribe(({ line, previousPrice }) => console.log(`${line.id}: ${previousPrice} → ${line.price}`));

// --- Host-owned context menu ---
const menu = document.getElementById('menu') as HTMLElement;
const colorCycle = Object.values(DEMO_COLORS).filter(color => color !== DEMO_COLORS.holding);
let alertCounter = 0;

function closeMenu(): void { menu.style.display = 'none'; menu.replaceChildren(); }
function menuItem(text: string, run: () => void): void {
	const button = document.createElement('button');
	button.textContent = text;
	button.addEventListener('click', () => { closeMenu(); run(); });
	menu.append(button);
}
lines.contextMenuRequested().subscribe(({ price, line, clientX, clientY }) => {
	closeMenu();
	if (line !== null) {
		menuItem('Set target price…', () => openEditor({ left: clientX, top: clientY, width: 0, height: 0 }, line.price.toFixed(2), value => {
			const next = parseFloat(value);
			if (Number.isFinite(next)) lines.updateLine(line.id, { price: next });
		}));
		menuItem('Change colour', () => lines.updateLine(line.id, { color: colorCycle[(colorCycle.indexOf(line.color) + 1) % colorCycle.length] }));
		menuItem('Remove', () => lines.removeLine(line.id));
	} else if (price !== null) {
		menuItem(`Add alert at ${price.toFixed(2)}`, () => lines.addLine({
			id: `alert-${++alertCounter}`, price, lineType: 'alert', color: DEMO_COLORS.alert, fontColor: FONT_COLOR, label: 'Alert', actions: ['cancel'],
		}));
	} else return;
	menu.style.left = `${clientX}px`; menu.style.top = `${clientY}px`; menu.style.display = 'flex';
});
document.addEventListener('pointerdown', event => { if (!menu.contains(event.target as Node)) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMenu(); editor.style.display = 'none'; } });
