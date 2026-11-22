import { LineSeries, Time, createChart } from 'lightweight-charts';
import { InteractivePriceLines, type InteractivePriceLineEditRequest } from '../interactive-price-lines';

const container = document.getElementById('chart') as HTMLElement;
const chart = createChart(container, { autoSize: true });
const series = chart.addSeries(LineSeries, { color: '#2962FF' });
series.setData(Array.from({ length: 80 }, (_, index) => ({ time: (1704067200 + index * 86400) as unknown as Time, value: 100 + Math.sin(index / 5) * 10 })));
chart.timeScale().fitContent();

const lines = new InteractivePriceLines(container);
series.attachPrimitive(lines);
lines.addLine({ id: 'sell-limit-1', price: 105, quantity: '10', label: 'Sell limit', color: '#F23645', actions: ['cancel', 'confirm'] });

const editor = document.getElementById('editor') as HTMLFormElement;
const input = document.getElementById('value') as HTMLInputElement;
let editing: InteractivePriceLineEditRequest | null = null;
lines.editRequested().subscribe(request => {
	editing = request;
	input.value = request.line[request.field];
	editor.style.left = `${request.anchor.left}px`;
	editor.style.top = `${request.anchor.top + request.anchor.height + 4}px`;
	editor.style.display = 'block';
	input.focus(); input.select();
});
editor.addEventListener('submit', event => {
	event.preventDefault();
	if (editing !== null) lines.updateLine(editing.line.id, { [editing.field]: input.value });
	editing = null; editor.style.display = 'none';
});
lines.actionClicked().subscribe(event => console.log(`${event.action}: ${event.line.id}`));
lines.priceChanged().subscribe(event => console.log(`${event.line.id}: ${event.previousPrice} → ${event.line.price}`));
