import React, { useState } from 'react';
import { Button } from '@grafana/ui';
import type { AlertOperator, MonitorField, MonitorUnit } from '../types';
import type { QueryItem } from '../monitoring';
import { evaluateMonitorRule, metricValue } from '../monitoring';

interface Props {
  fields: MonitorField[];
  queryIds: string[];
  items: QueryItem[];
  onChange: (next: MonitorField[]) => void;
  /** Permite thresholds individuais de atenção em POPs e enlaces. */
  enableWarningThresholds?: boolean;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '7px',
  background: '#111827',
  color: '#fff',
  border: '1px solid #526174',
  borderRadius: 4,
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#c8d6e5', marginBottom: 3 };

function newField(): MonitorField {
  return {
    id: `monitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Novo campo',
    queryRefId: '',
    itemKey: '',
    unit: 'auto',
  };
}

export const MonitorFieldsEditor: React.FC<Props> = ({ fields, queryIds, items, onChange, enableWarningThresholds = false }) => {
  // Controla apenas a interface local: recolher um campo não apaga seu cadastro.
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const toggleField = (id: string) => setExpandedIds((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  );
  const addField = () => {
    const field = newField();
    onChange([...fields, field]);
    // O campo recém-criado abre automaticamente para preenchimento.
    setExpandedIds((current) => [...current, field.id]);
  };
  const removeField = (id: string) => {
    onChange(fields.filter((field) => field.id !== id));
    setExpandedIds((current) => current.filter((item) => item !== id));
  };
  const changeOne = (id: string, patch: Partial<MonitorField>) =>
    onChange(fields.map((field) => field.id === id ? { ...field, ...patch } : field));

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= fields.length) { return; }
    const result = [...fields];
    [result[index], result[target]] = [result[target], result[index]];
    onChange(result);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>Campos de monitoramento ({fields.length})</strong>
        {fields.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setExpandedIds(fields.map((field) => field.id))}
              style={{ color: '#b5e4ff', background: 'transparent', border: 0, fontSize: 11, cursor: 'pointer', padding: 4 }}>
              Expandir todos
            </button>
            <button type="button" onClick={() => setExpandedIds([])}
              style={{ color: '#b5e4ff', background: 'transparent', border: 0, fontSize: 11, cursor: 'pointer', padding: 4 }}>
              Recolher todos
            </button>
          </div>
        )}
      </div>
      {queryIds.length === 0 && (
        <small style={{ color: '#fbbf24' }}>Nenhuma query detectada. Configure uma consulta na aba Queries do Grafana e aguarde a coleta.</small>
      )}
      {fields.map((field, index) => {
        const matchingItems = items.filter((item) => item.queryRefId === field.queryRefId);
        const chosenItemExists = matchingItems.some((item) => item.key === field.itemKey);
        const expanded = expandedIds.includes(field.id);
        const itemName = matchingItems.find((item) => item.key === field.itemKey)?.label;
        const warning = field.warningRule && evaluateMonitorRule(field.warningRule, field, items) === 'alert';
        return (
          <div key={field.id} style={{ padding: 9, background: '#182437', border: warning ? '1px solid #bd9723' : '1px solid #3a4e65', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Cabeçalho sempre visível; clique para recolher/expandir a configuração. */}
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`teif-monitor-config-${field.id}`}
              onClick={() => toggleField(field.id)}
              title={expanded ? 'Recolher configurações deste campo' : 'Expandir configurações deste campo'}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '5px 2px', background: 'transparent', border: 0, color: '#fff', cursor: 'pointer', textAlign: 'left', minHeight: 42 }}
            >
              <span aria-hidden="true" style={{ color: '#00ffff', fontSize: 19, flexShrink: 0 }}>{expanded ? '▾' : '▸'}</span>
              <span style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 0, gap: 3 }}>
                <strong style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{field.name.trim() || `Campo ${index + 1}`}</strong>
                <small style={{ fontSize: 11, color: '#aebcd0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {field.queryRefId ? `Query ${field.queryRefId}` : 'Query não configurada'}
                  {itemName ? ` · ${itemName}` : ''}
                </small>
              </span>
              {warning && <span style={{ color: '#facc15', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>ATENÇÃO</span>}
              <span style={{ color: '#b5e4ff', fontSize: 11, flexShrink: 0, maxWidth: 100, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {metricValue(field, items)}
              </span>
            </button>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center', borderTop: '1px solid #34465e', paddingTop: 7 }}>
              <small style={{ color: '#aebcd0', marginRight: 'auto' }}>Campo {index + 1}</small>
              <Button size="sm" variant="secondary" disabled={index === 0} onClick={() => move(index, -1)}>↑</Button>
              <Button size="sm" variant="secondary" disabled={index === fields.length - 1} onClick={() => move(index, 1)}>↓</Button>
              <Button size="sm" variant="secondary" onClick={() => removeField(field.id)}>Remover</Button>
            </div>
            {expanded && <div id={`teif-monitor-config-${field.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6, borderTop: '1px solid #34465e' }}>
            <div>
              <label style={labelStyle}>Nome do campo</label>
              <input style={inputStyle} maxLength={64} value={field.name} onChange={(e) => changeOne(field.id, { name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Query do Grafana</label>
              <select style={inputStyle} value={field.queryRefId} onChange={(e) => changeOne(field.id, { queryRefId: e.target.value, itemKey: '' })}>
                <option value="">Selecione a query</option>
                {queryIds.map((id) => <option key={id} value={id}>{id}</option>)}
                {field.queryRefId && !queryIds.includes(field.queryRefId) && <option value={field.queryRefId}>{field.queryRefId} (indisponível)</option>}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Item / série retornado pela query</label>
              <select style={inputStyle} value={field.itemKey} disabled={!field.queryRefId || matchingItems.length === 0} onChange={(e) => changeOne(field.id, { itemKey: e.target.value })}>
                <option value="">Selecione o item</option>
                {matchingItems.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                {field.itemKey && !chosenItemExists && <option value={field.itemKey}>Item anteriormente selecionado (indisponível)</option>}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Unidade</label>
              <select style={inputStyle} value={field.unit} onChange={(e) => changeOne(field.id, { unit: e.target.value as MonitorUnit })}>
                <option value="auto">Automática (Grafana)</option>
                <option value="bps">bits/s</option>
                <option value="Bps">bytes/s</option>
                <option value="percent">%</option>
                <option value="ms">ms</option>
                <option value="dBm">dBm</option>
                <option value="none">Número sem unidade</option>
              </select>
            </div>
            {enableWarningThresholds && (
              <div style={{ borderTop: '1px solid #405065', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    style={{ width: 16, height: 16, flexShrink: 0 }}
                    checked={Boolean(field.warningRule)}
                    onChange={(event) => changeOne(field.id, {
                      warningRule: event.target.checked ? { operator: 'gt', value: '0' } : undefined,
                    })}
                  />
                  Threshold de atenção (indicador amarelo)
                </label>
                {field.warningRule && (
                  <>
                    <label style={labelStyle}>Condição para ficar amarelo</label>
                    <select
                      style={inputStyle}
                      value={field.warningRule.operator}
                      onChange={(event) => changeOne(field.id, {
                        warningRule: { ...field.warningRule!, operator: event.target.value as AlertOperator },
                      })}
                    >
                      <option value="eq">Igual a (=)</option>
                      <option value="ne">Diferente de (≠)</option>
                      <option value="gt">Maior que (&gt;)</option>
                      <option value="gte">Maior ou igual (≥)</option>
                      <option value="lt">Menor que (&lt;)</option>
                      <option value="lte">Menor ou igual (≤)</option>
                    </select>
                    <label style={labelStyle}>Valor limite (na unidade bruta da query)</label>
                    <input
                      style={inputStyle}
                      value={field.warningRule.value}
                      placeholder="Ex.: 1000000000, 75 ou 100"
                      onChange={(event) => changeOne(field.id, {
                        warningRule: { ...field.warningRule!, value: event.target.value },
                      })}
                    />
                    <small style={{ color: '#facc15' }}>
                      Condição: {({ alert: 'ULTRAPASSADA', ok: 'Normal', 'no-data': 'Sem dados / condição inválida' } as const)[
                        evaluateMonitorRule(field.warningRule, field, items)
                      ]}
                    </small>
                  </>
                )}
              </div>
            )}
            <small style={{ color: '#b5e4ff' }}>Último valor: {metricValue(field, items)}</small>
            </div>}
          </div>
        );
      })}
      <Button size="sm" variant="primary" onClick={addField}>+ Adicionar campo</Button>
    </div>
  );
};

export const MonitorFieldsReadout: React.FC<{ fields: MonitorField[]; items: QueryItem[] }> = ({ fields, items }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    {fields.length === 0 ? (
      <small style={{ color: '#aebcd0' }}>Nenhum campo de monitoramento configurado.</small>
    ) : (
      fields.map((field) => (
        <div key={field.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #2c3c50', paddingBottom: 4 }}>
          <span style={{ overflowWrap: 'anywhere' }}>{field.name || 'Campo sem nome'}</span>
          <strong style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{metricValue(field, items)}</strong>
        </div>
      ))
    )}
  </div>
);
