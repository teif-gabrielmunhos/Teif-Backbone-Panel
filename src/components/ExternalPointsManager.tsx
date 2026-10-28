import React, { useMemo, useState } from 'react';
import { Button } from '@grafana/ui';
import type { FeatureIndexada } from '../geo/layers';
import { candidatosGeojson, posicaoCandidato } from '../geo/layers';
import type { BackbonePop } from '../types';

interface Props {
  index: FeatureIndexada[];
  pops: BackbonePop[];
  sourceUrl: string;
  project: string;
  onLocate: (item: FeatureIndexada) => void;
  onCreatePop: (item: FeatureIndexada) => void;
}

const inputStyle: React.CSSProperties = {
  padding: 7, width: '100%', boxSizing: 'border-box', color: '#fff', background: '#101d2e',
  border: '1px solid #526174', borderRadius: 4,
};

export const ExternalPointsManager: React.FC<Props> = ({ index, pops, sourceUrl, project, onLocate, onCreatePop }) => {
  const [kind, setKind] = useState<'pop' | 'hub'>('pop');
  const [search, setSearch] = useState('');
  const candidates = useMemo(() => candidatosGeojson(index), [index]);
  const filtered = useMemo(() => {
    const text = search.trim().toLocaleLowerCase('pt-BR');
    return candidates.filter(item => item.tipoPonto === kind && (!project || item.projeto === project) &&
      (!text || `${String(item.feature.properties?.name ?? '')} ${item.projeto} ${item.feature.properties?.pasta ?? ''}`
        .toLocaleLowerCase('pt-BR').includes(text)));
  }, [candidates, kind, search, project]);
  const linked = new Set(pops.filter(pop => pop.externalGeojsonSource?.url === sourceUrl)
    .map(pop => pop.externalGeojsonSource?.featureId));
  const popCount = candidates.filter(item => item.tipoPonto === 'pop').length;
  const hubCount = candidates.filter(item => item.tipoPonto === 'hub').length;
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <strong>Candidatos do GeoJSON externo</strong>
    <small>Encontrados: {popCount} marcados como POP e {hubCount} marcados como HUB. Nenhum vira POP monitorado automaticamente.</small>
    <div style={{ display: 'flex', gap: 6 }}>
      <Button size="sm" variant={kind === 'pop' ? 'primary' : 'secondary'} onClick={() => setKind('pop')}>POPs ({popCount})</Button>
      <Button size="sm" variant={kind === 'hub' ? 'primary' : 'secondary'} onClick={() => setKind('hub')}>HUBs ({hubCount})</Button>
    </div>
    <input style={inputStyle} value={search} onChange={e => setSearch(e.target.value)}
      placeholder="Pesquisar nome, projeto ou pasta..." />
    <small>{filtered.length} candidatos encontrados; mostrando no máximo 60. Use a pesquisa para localizar outros.</small>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
      {filtered.slice(0, 60).map(item => {
        const pos = posicaoCandidato(item);
        const done = linked.has(item.id);
        return <div key={item.id} style={{ border: '1px solid #415168', borderRadius: 5,
          padding: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <strong style={{ overflowWrap: 'anywhere', fontSize: 12 }}>{String(item.feature.properties?.name ?? 'Sem nome')}</strong>
          <small style={{ overflowWrap: 'anywhere' }}>{item.projeto} · {item.tipoPonto.toUpperCase()}</small>
          <small style={{ overflowWrap: 'anywhere', opacity: 0.8 }}>{String(item.feature.properties?.pasta ?? '')}</small>
          {pos && <small>{pos[0].toFixed(6)}, {pos[1].toFixed(6)}</small>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button size="sm" variant="secondary" onClick={() => onLocate(item)} disabled={!pos}>Localizar</Button>
            <Button size="sm" variant="primary" disabled={!pos || done} onClick={() => onCreatePop(item)}>
              {done ? 'POP já cadastrado' : 'Confirmar como POP'}
            </Button>
          </div>
        </div>;
      })}
    </div>
    {filtered.length === 0 && <small>Nenhum candidato corresponde ao filtro.</small>}
    <small>A conversão exige confirmação individual; HUBs não são assumidos como OLTs.</small>
  </div>;
};
