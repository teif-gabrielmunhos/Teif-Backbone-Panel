import { FieldType } from '@grafana/data';
import type { DataFrame, Field, PanelData } from '@grafana/data';
import type { MonitorField, MonitorUnit, LinkAlertRule, PopAlertRule, FieldWarningRule } from './types';

/**
 * Faz a ponte entre os campos de monitoramento e o resultado real das queries.
 * A associação usa refId + identidade da série + campo + labels.
 * Em caso de séries absolutamente idênticas, adicionamos um ordinal.
 */
export interface QueryItem {
  key: string;
  queryRefId: string;
  label: string;
  field: Field;
}

function sortedLabels(labels?: Record<string, string>): Array<[string, string]> {
  return Object.entries(labels ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

export function availableQueryItems(series: DataFrame[]): QueryItem[] {
  const items: QueryItem[] = [];
  const seen = new Map<string, number>();

  for (const frame of series ?? []) {
    const queryRefId = frame.refId ?? '';
    for (const field of frame.fields) {
      if (
        field.type !== FieldType.number &&
        field.type !== FieldType.string &&
        field.type !== FieldType.boolean
      ) {
        continue;
      }

      // Chave não depende da posição global da série no resultado do Grafana.
      const identity = JSON.stringify({
        q: queryRefId,
        s: frame.name ?? '',
        f: field.name,
        fl: sortedLabels(field.labels),
      });
      const ordinal = seen.get(identity) ?? 0;
      seen.set(identity, ordinal + 1);
      const key = `${identity}#${ordinal}`;

      const labelFromGrafana = field.config?.displayName || field.config?.displayNameFromDS;
      const labelsText = sortedLabels(field.labels).map(([k, v]) => `${k}=${v}`).join(', ');
      const seriesLabel = frame.name || labelsText || 'Série sem nome';
      const fieldLabel = labelFromGrafana || field.name;
      const label = `${seriesLabel} → ${fieldLabel}${labelsText && frame.name ? ` (${labelsText})` : ''}`;

      items.push({ key, queryRefId, label, field });
    }
  }
  return items;
}

export function availableQueryIds(data: PanelData): string[] {
  const ids = [
    ...(data.request?.targets ?? []).map((target) => target.refId),
    ...data.series.map((frame) => frame.refId ?? ''),
  ];
  return [...new Set(ids.filter((id): id is string => Boolean(id)))].sort();
}

function lastValidValue(field: Field): unknown {
  const values = field.values;
  if (!values) { return undefined; }
  // Compatível com arrays atuais e os Vectors presentes em versões mais antigas.
  const vector = values as unknown as { length: number; get?: (index: number) => unknown; [index: number]: unknown };
  for (let i = vector.length - 1; i >= 0; i--) {
    const value = typeof vector.get === 'function' ? vector.get(i) : vector[i];
    if (value !== null && value !== undefined && value !== '' && !(typeof value === 'number' && !Number.isFinite(value))) {
      return value;
    }
  }
  return undefined;
}

function formatValue(value: unknown, unit: MonitorUnit, field: Field): string {
  if (typeof value !== 'number') { return String(value); }
  if (unit === 'auto') {
    const rendered = field.display?.(value);
    if (rendered) { return [rendered.text, rendered.suffix].filter(Boolean).join(' '); }
  }
  const number = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
  if (unit === 'bps' || unit === 'Bps') {
    const suffixes = unit === 'bps' ? ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'] : ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
    let scaled = value;
    let index = 0;
    while (Math.abs(scaled) >= 1000 && index < suffixes.length - 1) { scaled /= 1000; index++; }
    return `${number(scaled)} ${suffixes[index]}`;
  }
  if (unit === 'percent') { return `${number(value)} %`; }
  if (unit === 'ms') { return `${number(value)} ms`; }
  if (unit === 'dBm') { return `${number(value)} dBm`; }
  return number(value);
}

export function metricValue(config: MonitorField, available: QueryItem[]): string {
  if (!config.queryRefId || !config.itemKey) { return 'Não configurado'; }
  const item = available.find((candidate) => candidate.key === config.itemKey && candidate.queryRefId === config.queryRefId);
  if (!item) { return 'Item não encontrado'; }
  const raw = lastValidValue(item.field);
  if (raw === undefined) { return 'Sem dados'; }
  return formatValue(raw, config.unit, item.field);
}

/**
 * Estado operacional do enlace baseado numa única métrica selecionada.
 * 'normal': nenhuma regra configurada; 'ok': regra não disparou;
 * 'alert': regra disparou; 'no-data': indicador sem leitura confiável.
 * Zero é um valor VÁLIDO, distinto de dado ausente.
 */
export type LinkVisualState = 'normal' | 'ok' | 'alert' | 'no-data';

export function rawMonitorValue(config: MonitorField, available: QueryItem[]): unknown {
  if (!config.queryRefId || !config.itemKey) { return undefined; }
  const item = available.find(
    (candidate) => candidate.queryRefId === config.queryRefId && candidate.key === config.itemKey
  );
  return item ? lastValidValue(item.field) : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'boolean') { return value ? 1 : 0; }
  if (typeof value === 'number') { return Number.isFinite(value) ? value : undefined; }
  if (typeof value === 'string' && value.trim() !== '') {
    const result = Number(value.trim());
    return Number.isFinite(result) ? result : undefined;
  }
  return undefined;
}

/**
 * Avalia uma regra independentemente do nome, da unidade e da cor do enlace.
 * Comparação SEM arredondamento nem conversão de unidades: 50_000_000 para 50 Mbps.
 * Sem leitura, item removido ou operador numérico inválido => no-data, nunca 0.
 */
export type RuleState = 'alert' | 'ok' | 'no-data';

export function evaluateMonitorRule(
  rule: FieldWarningRule | undefined,
  field: MonitorField | undefined,
  available: QueryItem[]
): RuleState {
  if (!rule || !field || !rule.value.trim()) { return 'no-data'; }
  const raw = rawMonitorValue(field, available);
  if (raw === undefined || raw === null || raw === '') { return 'no-data'; }

  const actualNumber = asNumber(raw);
  const expectedNumber = asNumber(rule.value);
  if (rule.operator === 'eq' || rule.operator === 'ne') {
    const equal = actualNumber !== undefined && expectedNumber !== undefined
      ? actualNumber === expectedNumber
      : String(raw).trim().toLocaleLowerCase() === rule.value.trim().toLocaleLowerCase();
    return (rule.operator === 'eq' ? equal : !equal) ? 'alert' : 'ok';
  }
  if (actualNumber === undefined || expectedNumber === undefined) { return 'no-data'; }
  switch (rule.operator) {
    case 'gt': return actualNumber > expectedNumber ? 'alert' : 'ok';
    case 'gte': return actualNumber >= expectedNumber ? 'alert' : 'ok';
    case 'lt': return actualNumber < expectedNumber ? 'alert' : 'ok';
    case 'lte': return actualNumber <= expectedNumber ? 'alert' : 'ok';
    default: return 'no-data';
  }
}

/** Mantém a API legada da v0.7: alerta vermelho = DOWN. */
export function linkVisualState(
  rule: LinkAlertRule | undefined,
  fields: MonitorField[],
  available: QueryItem[]
): LinkVisualState {
  if (!rule || !rule.fieldId) { return 'normal'; }
  return evaluateMonitorRule(rule, fields.find((field) => field.id === rule.fieldId), available);
}

/**
 * Explicação de um alerta disparado, pronta para ser exibida no popup.
 * O cálculo usa o valor bruto; a apresentação respeita a unidade do campo.
 */
export interface LinkAlertReason {
  fieldId: string;
  fieldName: string;
  operator: string;
  actual: string;
  threshold: string;
}

export interface LinkHealthReport {
  state: LinkHealthState;
  downReason?: LinkAlertReason;
  warningReasons: LinkAlertReason[];
}

const operatorSymbols: Record<FieldWarningRule['operator'], string> = {
  eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤',
};

function matchedAlertReason(
  rule: FieldWarningRule | undefined,
  config: MonitorField | undefined,
  available: QueryItem[]
): LinkAlertReason | undefined {
  if (!rule || !config || evaluateMonitorRule(rule, config, available) !== 'alert') {
    return undefined;
  }
  const item = available.find(
    (candidate) => candidate.queryRefId === config.queryRefId && candidate.key === config.itemKey
  );
  if (!item) { return undefined; }
  const raw = lastValidValue(item.field);
  if (raw === undefined) { return undefined; }

  // Thresholds são comparados na unidade bruta da query, nunca no valor arredondado.
  // Aqui fazemos apenas a formatação para o operador enxergar os dois valores.
  const limitNumber = asNumber(rule.value);
  const displayLimit = limitNumber === undefined
    ? rule.value
    : formatValue(limitNumber, config.unit, item.field);

  return {
    fieldId: config.id,
    fieldName: config.name.trim() || 'Campo sem nome',
    operator: operatorSymbols[rule.operator] ?? rule.operator,
    actual: formatValue(raw, config.unit, item.field),
    threshold: displayLimit,
  };
}

/** Retorna o estado E os motivos, inclusive múltiplos thresholds simultâneos. */
export function linkHealthReport(
  downRule: LinkAlertRule | undefined,
  fields: MonitorField[],
  available: QueryItem[]
): LinkHealthReport {
  const downField = fields.find((field) => field.id === downRule?.fieldId);
  const downState = linkVisualState(downRule, fields, available);
  const downReason = matchedAlertReason(downRule, downField, available);

  const warningStates = fields
    .filter((field) => Boolean(field.warningRule))
    .map((field) => ({
      field,
      state: evaluateMonitorRule(field.warningRule, field, available),
    }));
  const warningReasons = warningStates
    .filter(({ state }) => state === 'alert')
    .map(({ field }) => matchedAlertReason(field.warningRule, field, available))
    .filter((reason): reason is LinkAlertReason => reason !== undefined);

  // A prioridade do estado NÃO depende da quantidade de motivos exibidos.
  if (downState === 'alert') { return { state: 'down', downReason, warningReasons }; }
  if (warningStates.some(({ state }) => state === 'alert')) {
    return { state: 'warning', warningReasons };
  }
  if (downState === 'no-data' || warningStates.some(({ state }) => state === 'no-data')) {
    return { state: 'no-data', warningReasons: [] };
  }
  if (downState === 'ok' || warningStates.length > 0) {
    return { state: 'ok', warningReasons: [] };
  }
  return { state: 'normal', warningReasons: [] };
}

/** Estado hierárquico compartilhado entre POPs e enlaces. */
export type LinkHealthState = 'normal' | 'ok' | 'down' | 'warning' | 'no-data';

/** Reaproveita a avaliação consolidada dos enlaces também para os POPs. */
export function popHealthReport(
  downRule: PopAlertRule | undefined,
  fields: MonitorField[],
  available: QueryItem[]
): LinkHealthReport {
  return linkHealthReport(downRule, fields, available);
}

/** Compatibilidade com a v0.8: retorna somente a cor/estado. */
export function linkHealthState(
  downRule: LinkAlertRule | undefined,
  fields: MonitorField[],
  available: QueryItem[]
): LinkHealthState {
  return linkHealthReport(downRule, fields, available).state;
}
