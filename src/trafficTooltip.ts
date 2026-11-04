import { FieldType } from '@grafana/data';
import type { DataFrame } from '@grafana/data';
import type { QueryItem } from './monitoring';
import type { BackboneLink, MonitorField, MonitorUnit } from './types';

/**
 * Mini-gráfico sob demanda. Reutiliza os DataFrames já recebidos pelo painel:
 * não realiza chamadas HTTP, não instancia um painel Grafana e não lê credenciais.
 */
type Point = { t: number; y: number };
type Direction = 'download' | 'upload';
type TrafficLine = {
  name: string;
  color: string;
  points: Point[];
  lastRaw: number | undefined;
  unit: MonitorUnit;
  displayUnit: string;
};

const DOWNLOAD_NAME = /(?:^|[^a-z])(?:rx|download|downstream|received|receive|recebido|recebida|entrada|inbound)(?:$|[^a-z])/i;
const UPLOAD_NAME = /(?:^|[^a-z])(?:tx|upload|upstream|sent|send|enviado|enviada|saida|outbound)(?:$|[^a-z])/i;
const NS = 'http://www.w3.org/2000/svg';

/** Dá prioridade à escolha explícita; na ausência, reconhece RX/TX pelo nome. */
function chooseField(link: BackboneLink, direction: Direction, available: QueryItem[]): MonitorField | undefined {
  const fields = link.monitoringFields ?? [];
  const explicit = direction === 'download' ? link.trafficTooltip?.downloadFieldId : link.trafficTooltip?.uploadFieldId;
  if (explicit) { return fields.find(field => field.id === explicit); }
  const rx = direction === 'download';
  const pattern = rx ? DOWNLOAD_NAME : UPLOAD_NAME;
  const other = rx ? UPLOAD_NAME : DOWNLOAD_NAME;
  const byName = fields.find(field => pattern.test(field.name) && !other.test(field.name));
  if (byName) { return byName; }
  return fields.find(field => {
    const item = available.find(candidate => candidate.key === field.itemKey && candidate.queryRefId === field.queryRefId);
    return !!item && pattern.test(item.label) && !other.test(item.label);
  });
}

function vectorLength(values: unknown): number {
  if (!values || typeof values !== 'object') { return 0; }
  const len = (values as { length?: number }).length;
  return typeof len === 'number' && Number.isFinite(len) ? len : 0;
}
function at(values: unknown, index: number): unknown {
  if (!values || typeof values !== 'object') { return undefined; }
  const vector = values as { get?: (i: number) => unknown; [key: number]: unknown };
  return typeof vector.get === 'function' ? vector.get(index) : vector[index];
}
function timestamp(v: unknown): number | undefined {
  if (v instanceof Date) { return v.getTime(); }
  if (typeof v === 'number') { return Number.isFinite(v) ? (v < 100_000_000_000 ? v * 1000 : v) : undefined; }
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
function numeric(v: unknown): number | undefined {
  if (typeof v === 'number') { return Number.isFinite(v) ? v : undefined; }
  if (typeof v === 'string' && v.trim()) {
    const result = Number(v);
    return Number.isFinite(result) ? result : undefined;
  }
  return undefined;
}

function extract(field: MonitorField | undefined, items: QueryItem[], frames: DataFrame[], color: string, name: string): TrafficLine | null {
  if (!field) { return null; }
  const item = items.find(i => i.key === field.itemKey && i.queryRefId === field.queryRefId);
  if (!item) { return { name, color, points: [], lastRaw: undefined, unit: field.unit, displayUnit: '' }; }
  const frame = frames.find(f => f.fields.some(fld => fld === item.field));
  const timeField = frame?.fields.find(fld => fld.type === FieldType.time);
  const configUnit = field.unit === 'auto' ? item.field.config?.unit ?? '' : field.unit;
  const unit = configUnit === 'Bps' || configUnit === 'bytes/s' ? 'Bps' :
    configUnit === 'bps' || configUnit === 'bits/s' ? 'bps' : field.unit;
  const points: Point[] = [];
  let lastRaw: number | undefined;
  const count = vectorLength(item.field.values);
  for (let n = 0; n < count; n++) {
    const y = numeric(at(item.field.values, n));
    if (y === undefined) { continue; }
    lastRaw = y;
    if (!timeField) { continue; }
    const t = timestamp(at(timeField.values, n));
    if (t !== undefined) { points.push({ t, y: unit === 'Bps' ? y * 8 : y }); }
  }
  points.sort((a, b) => a.t - b.t);
  return { name, color, points, lastRaw, unit, displayUnit: unit === 'Bps' || unit === 'bps' ? 'bps' : '' };
}

function formatNumber(value: number, suffix: string): string {
  if (!Number.isFinite(value)) { return '—'; }
  const scales = ['', 'K', 'M', 'G', 'T', 'P'];
  let v = value;
  let i = 0;
  while (Math.abs(v) >= 1000 && i < scales.length - 1) { v /= 1000; i++; }
  const fmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 1 });
  return `${fmt.format(v)} ${scales[i]}${suffix}`.trim();
}
function lastValue(line: TrafficLine | null): string {
  if (!line || line.lastRaw === undefined) { return 'Sem dados'; }
  if (line.unit === 'bps') { return formatNumber(line.lastRaw, 'bps'); }
  if (line.unit === 'Bps') { return formatNumber(line.lastRaw, 'B/s'); }
  return formatNumber(line.lastRaw, '');
}
function slim(points: Point[], max: number): Point[] {
  if (points.length <= max) { return points; }
  const chosen: Point[] = [points[0]];
  const bucket = Math.ceil((points.length - 2) / Math.max(1, Math.floor((max - 2) / 2)));
  for (let i = 1; i < points.length - 1; i += bucket) {
    const end = Math.min(points.length - 1, i + bucket);
    let lo = points[i];
    let hi = points[i];
    for (let k = i + 1; k < end; k++) {
      if (points[k].y < lo.y) { lo = points[k]; }
      if (points[k].y > hi.y) { hi = points[k]; }
    }
    if (lo.t <= hi.t) { chosen.push(lo); if (lo !== hi) { chosen.push(hi); } }
    else { chosen.push(hi); chosen.push(lo); }
  }
  chosen.push(points[points.length - 1]);
  return chosen;
}
function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) { node.className = className; }
  if (text !== undefined) { node.textContent = text; }
  return node;
}
function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) { node.setAttribute(key, value); }
  return node;
}
function clock(t: number, withDate: boolean): string {
  const d = new Date(t);
  return withDate
    ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Cria o DOM do tooltip somente quando o usuário passa o mouse no enlace. */
export function createLinkTrafficTooltip(link: BackboneLink, items: QueryItem[], frames: DataFrame[], statusText: string): HTMLElement {
  const root = el('div', 'teif-traffic-card');
  root.appendChild(el('div', 'teif-traffic-title', statusText));

  const downloadField = chooseField(link, 'download', items);
  const uploadField = chooseField(link, 'upload', items);
  const download = extract(downloadField, items, frames, '#22c55e', 'Download');
  const upload = extract(uploadField, items, frames, '#38bdf8', 'Upload');
  if (!download && !upload) {
    root.appendChild(el('div', 'teif-traffic-note', 'Configure os campos Download e Upload nas métricas do enlace.'));
    return root;
  }

  const legend = el('div', 'teif-traffic-legend');
  for (const [line, name, color] of [[download, 'Download', '#22c55e'], [upload, 'Upload', '#38bdf8']] as const) {  
    const label = el('span', 'teif-traffic-legend-item');
    const dot = el('i', 'teif-traffic-legend-dot');
    dot.style.backgroundColor = color;
    label.appendChild(dot);
    label.appendChild(document.createTextNode(`${name}: ${lastValue(line)}`));
    legend.appendChild(label);
  }
  root.appendChild(legend);

  const visible = [download, upload].filter((s): s is TrafficLine => Boolean(s && s.points.length >= 2));
  if (visible.length === 0) {
    root.appendChild(el('div', 'teif-traffic-empty', 'Histórico indisponível. Na query do Zabbix, retorne uma série temporal (não apenas o último valor).'));
    return root;
  }

  // Agregação linear: evita expandir dezenas de milhares de amostras em argumentos.
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymax = 1;
  for (const line of visible) {
    for (const pt of line.points) {
      xmin = Math.min(xmin, pt.t);
      xmax = Math.max(xmax, pt.t);
      ymax = Math.max(ymax, pt.y);
    }
  }
  if (xmin === xmax) {
    root.appendChild(el('div', 'teif-traffic-empty', 'Ainda não há pontos suficientes para desenhar o histórico.'));
    return root;
  }
  const W = 360, H = 168, left = 85, right = 12, top = 12, bottom = 27;
  const iw = W - left - right, ih = H - top - bottom;
  const px = (t: number) => left + ((t - xmin) / (xmax - xmin)) * iw;
  const py = (v: number) => top + ih * (1 - Math.max(0, v) / ymax);
  const chart = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'teif-traffic-svg', role: 'img', 'aria-label': 'Série temporal de Download e Upload' });
  for (const ratio of [0, 0.5, 1]) {
    const y = top + ratio * ih;
    chart.appendChild(svgEl('line', { x1: String(left), x2: String(W - right), y1: String(y), y2: String(y), stroke: '#334155', 'stroke-width': '1' }));
    const txt = svgEl('text', { x: String(left - 5), y: String(y + 4), 'text-anchor': 'end', fill: '#bac9dc', 'font-size': '10' });
    txt.textContent = formatNumber((1 - ratio) * ymax, visible.every(v => v.displayUnit === 'bps') ? 'bps' : '');
    chart.appendChild(txt);
  }
  for (const line of visible) {
    const sampled = slim(line.points, 200);
    const path = sampled.map((pt, i) => `${i === 0 ? 'M' : 'L'}${px(pt.t).toFixed(1)},${py(pt.y).toFixed(1)}`).join(' ');
    chart.appendChild(svgEl('path', { d: path, fill: 'none', stroke: line.color, 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  const withDate = xmax - xmin > 23 * 60 * 60 * 1000;
  for (const [x, t, anchor] of [[left, xmin, 'start'], [W - right, xmax, 'end']] as const) {
    const txt = svgEl('text', { x: String(x), y: String(H - 7), fill: '#cbd5e1', 'font-size': '10', 'text-anchor': anchor });
    txt.textContent = clock(t, withDate);
    chart.appendChild(txt);
  }
  root.appendChild(chart);
  root.appendChild(el('div', 'teif-traffic-caption', 'Período: o mesmo selecionado no dashboard Grafana.'));
  if (visible.length === 1) {
    root.appendChild(el('div', 'teif-traffic-note', 'Uma das séries não tem histórico suficiente. Confira a query correspondente.'));
  }
  return root;
}
