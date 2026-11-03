import React from 'react';
import type { KmzLayerSettings } from '../types';
import { definirConfiguracaoCamadas } from '../geo/layers';

interface Props {
  settings?: Partial<KmzLayerSettings>;
  projects: string[];
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  onSettingsChange: (settings: KmzLayerSettings) => void;
  onClose: () => void;
}

const style: React.CSSProperties = {
  background: '#111827',
  color: '#fff',
  border: '1px solid #516477',
  width: '100%',
  borderRadius: 4,
  boxSizing: 'border-box',
  height: 34,
  minHeight: 34,
  flexShrink: 0,
  lineHeight: 'normal',
  padding: '0 9px',
  fontSize: 12,
  colorScheme: 'dark',
};

/** Acesso operacional aos filtros, inclusive em modo de visualização / TV. */
export const LayerQuickControls: React.FC<Props> = ({ settings: raw, projects, enabled, onEnabledChange, onSettingsChange, onClose }) => {
  const current = definirConfiguracaoCamadas(raw);
  const change = (patch: Partial<KmzLayerSettings>) => onSettingsChange({ ...current, ...patch });
  return (
    <div style={{ background: 'rgba(15,23,42,0.97)', border: '1px solid #41657b',
      padding: 12, width: 300, maxWidth: 'calc(100vw - 30px)', borderRadius: 8,
      boxShadow: '0 4px 18px #0008', display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'auto', overflow: 'auto', maxHeight: '75vh', color: '#fff', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Camadas do mapa</strong>
        <button type="button" style={{ ...style, width: 'auto', cursor: 'pointer' }} onClick={onClose}>Fechar</button>
      </div>
      <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)}/>
        Mostrar GeoJSON externo
      </label>
      <label>Projeto visível</label>
      <select style={style} value={current.project} onChange={(event) => change({ project: event.target.value })}>
        <option value="">Todos os projetos</option>
        {projects.map((project) => <option key={project} value={project}>{project}</option>)}
      </select>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
        {([['backbone', 'Backbone'], ['ftth', 'FTTH'], ['outros', 'Outros'], ['points', 'Pontos']] as const)
          .map(([key, label]) => <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={current[key]} onChange={event => change({ [key]: event.target.checked })}/>{label}
          </label>)}
      </div>
      <label>Mostrar FTTH a partir do zoom</label>
      <select style={style} value={current.minZoomFtth} onChange={event => change({ minZoomFtth: Number(event.target.value) })}>
        <option value={0}>Sempre</option>
        <option value={11}>11 · Região</option>
        <option value={13}>13 · Cidade</option>
        <option value={15}>15 · Rua</option>
      </select>
      <small style={{ color: '#a6c5d3' }}>Os POPs e enlaces monitorados permanecem visíveis.</small>
    </div>
  );
};
