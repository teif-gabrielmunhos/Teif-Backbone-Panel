import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@grafana/ui';
import { nearbyPop, routeEndpointSuggestions } from '../kmzAssociations';
import type { BackboneLink, BackbonePop, ImportedRoute, ImportedWaypoint } from '../types';

const control: React.CSSProperties = {
  color: '#fff', background: '#111827', border: '1px solid #526174',
  borderRadius: 4, padding: '7px 8px', width: '100%', boxSizing: 'border-box', minWidth: 0,
};
const card: React.CSSProperties = {
  padding: 9, borderRadius: 5, border: '1px solid #405065',
  display: 'flex', flexDirection: 'column', gap: 7,
};

interface WaypointRowProps {
  point: ImportedWaypoint;
  pops: BackbonePop[];
  occupiedPopIds: Set<string>;
  onRename: (id: string, name: string) => void;
  onCreatePop: (id: string) => void;
  onAssociate: (id: string, popId: string) => void;
  onDisassociate: (id: string) => void;
  onLocate: (point: ImportedWaypoint) => void;
}

const WaypointRow: React.FC<WaypointRowProps> = ({
  point, pops, occupiedPopIds, onRename, onCreatePop, onAssociate, onDisassociate, onLocate,
}) => {
  const [draft, setDraft] = useState(point.name);
  const [existingPopId, setExistingPopId] = useState('');
  useEffect(() => { setDraft(point.name); }, [point.id, point.name]);
  const linkedPop = pops.find(pop => pop.id === point.linkedPopId);
  const nearby = nearbyPop(point.position, pops, 10);
  const candidates = pops.filter(pop => !occupiedPopIds.has(pop.id) || pop.id === point.linkedPopId);

  return (
    <details style={card}>
      <summary style={{ cursor: 'pointer', overflowWrap: 'anywhere', fontSize: 12 }}>
        <strong>{linkedPop ? linkedPop.name : point.name}</strong>
        {' '}{linkedPop ? '✅ POP monitorável' : '· Ponto KMZ'}
      </summary>
      <small>Coordenadas: {point.position[0].toFixed(6)}, {point.position[1].toFixed(6)}</small>
      <small style={{ overflowWrap: 'anywhere' }}>{point.sourceFile}</small>
      <label style={{ fontSize: 12 }}>Nome original do ponto KMZ</label>
      <input value={draft} style={control} maxLength={120} onChange={e => setDraft(e.target.value)} />
      <Button size="sm" variant="secondary" disabled={!draft.trim() || draft.trim() === point.name}
        onClick={() => onRename(point.id, draft.trim())}>Salvar nome do ponto</Button>
      <Button size="sm" variant="secondary" onClick={() => onLocate(point)}>Localizar no mapa</Button>
      {linkedPop ? (
        <>
          <small>POP associado: <strong>{linkedPop.name}</strong>. Edite seu nome e monitoramento clicando no marcador do POP.</small>
          <Button size="sm" variant="secondary" onClick={() => onDisassociate(point.id)}>Desvincular POP (sem excluir)</Button>
        </>
      ) : (
        <>
          {nearby && <small style={{ color: '#facc15' }}>Já existe um POP a até 10 m: {nearby.name}. Vincule-o para evitar duplicidade.</small>}
          <Button size="sm" variant="primary" disabled={Boolean(nearby)}
            onClick={() => onCreatePop(point.id)}>Transformar em POP monitorável</Button>
          <label style={{ fontSize: 12 }}>Ou vincular a um POP já criado</label>
          <select style={control} value={existingPopId} onChange={e => setExistingPopId(e.target.value)}>
            <option value="">Selecione um POP existente...</option>
            {candidates.map(pop => <option key={pop.id} value={pop.id}>{pop.name}</option>)}
          </select>
          <Button size="sm" variant="secondary" disabled={!existingPopId}
            onClick={() => { onAssociate(point.id, existingPopId); setExistingPopId(''); }}>Vincular POP selecionado</Button>
          <small>O vínculo é lógico e não desloca o marcador do POP existente.</small>
        </>
      )}
    </details>
  );
};

interface RouteRowProps {
  route: ImportedRoute;
  pops: BackbonePop[];
  usedLinks: BackboneLink[];
  onUpdate: (id: string, patch: Partial<ImportedRoute>) => void;
  onRemove: (id: string) => void;
  onLocate: (route: ImportedRoute) => void;
}
const RouteRow: React.FC<RouteRowProps> = ({ route, pops, usedLinks, onUpdate, onRemove, onLocate }) => {
  const suggestion = routeEndpointSuggestions(route, pops, 100);
  const canSuggest = (!route.sourcePopId && !!suggestion.sourcePopId) ||
    (!route.targetPopId && !!suggestion.targetPopId);
  const numPoints = route.segments.reduce((sum, segment) => sum + segment.length, 0);
  return (
    <details style={card}>
      <summary style={{ cursor: 'pointer', overflowWrap: 'anywhere', fontSize: 12 }}>
        <strong>{route.name}</strong>{' '}{usedLinks.length ? '· Enlace monitorado' : '· Rota KMZ'}
      </summary>
      <small>{numPoints} coordenadas · {route.sourceFile}</small>
      <label style={{ fontSize: 12 }}>Origem da rota (POP)</label>
      <select style={control} value={route.sourcePopId ?? ''}
        onChange={e => onUpdate(route.id, { sourcePopId: e.target.value || undefined })}>
        <option value="">Não associado</option>
        {pops.map(pop => <option key={pop.id} value={pop.id}>{pop.name}</option>)}
      </select>
      <label style={{ fontSize: 12 }}>Destino da rota (POP)</label>
      <select style={control} value={route.targetPopId ?? ''}
        onChange={e => onUpdate(route.id, { targetPopId: e.target.value || undefined })}>
        <option value="">Não associado</option>
        {pops.map(pop => <option key={pop.id} value={pop.id}>{pop.name}</option>)}
      </select>
      <Button size="sm" variant="secondary" disabled={!canSuggest} onClick={() => onUpdate(route.id, {
        sourcePopId: route.sourcePopId || suggestion.sourcePopId,
        targetPopId: route.targetPopId || suggestion.targetPopId,
      })}>Aplicar sugestão por proximidade (100 m)</Button>
      <small>Associação manual é recomendada. A sugestão usa apenas as extremidades e nunca altera a geometria.</small>
      {usedLinks.length > 0 && <small>Enlace(s): {usedLinks.map(link => link.name).join(', ')}</small>}
      <Button size="sm" variant="secondary" onClick={() => onLocate(route)}>Localizar</Button>
      <Button size="sm" variant="secondary" disabled={usedLinks.length > 0}
        onClick={() => onRemove(route.id)}>Remover rota</Button>
    </details>
  );
};

export interface KmzManagerProps {
  routes: ImportedRoute[];
  waypoints: ImportedWaypoint[];
  pops: BackbonePop[];
  links: BackboneLink[];
  showPreview: boolean;
  loading: boolean;
  message: string;
  onTogglePreview: (show: boolean) => void;
  onImport: () => void;
  onClose: () => void;
  onRenameWaypoint: (id: string, name: string) => void;
  onCreatePop: (id: string) => void;
  onAssociateWaypoint: (id: string, popId: string) => void;
  onDisassociateWaypoint: (id: string) => void;
  onLocateWaypoint: (point: ImportedWaypoint) => void;
  onUpdateRoute: (id: string, patch: Partial<ImportedRoute>) => void;
  onRemoveRoute: (id: string) => void;
  onLocateRoute: (route: ImportedRoute) => void;
  onRemoveWaypoints: () => void;
}

export const KmzManager: React.FC<KmzManagerProps> = (props) => {
  const [tab, setTab] = useState<'waypoints' | 'routes'>('waypoints');
  const [search, setSearch] = useState('');
  const filtered = search.trim().toLocaleLowerCase('pt-BR');
  const routes = useMemo(() => props.routes.filter(route =>
    route.name.toLocaleLowerCase('pt-BR').includes(filtered) || route.sourceFile.toLocaleLowerCase('pt-BR').includes(filtered)
  ), [props.routes, filtered]);
  const waypoints = useMemo(() => props.waypoints.filter(point =>
    point.name.toLocaleLowerCase('pt-BR').includes(filtered) ||
    props.pops.find(pop => pop.id === point.linkedPopId)?.name.toLocaleLowerCase('pt-BR').includes(filtered)
  ), [props.waypoints, props.pops, filtered]);
  const occupiedPopIds = new Set(props.waypoints.map(point => point.linkedPopId).filter((id): id is string => Boolean(id)));
  const linkedCount = props.waypoints.filter(point => props.pops.some(pop => pop.id === point.linkedPopId)).length;
  return (
    <>
      <strong>Gerenciar KMZ/KML</strong>
      <small>Converta os pontos do Google Earth em POPs com monitoramento e associe as extremidades de cada rota.</small>
      <Button size="sm" variant="primary" disabled={props.loading} onClick={props.onImport}>
        {props.loading ? 'Importando...' : 'Selecionar arquivo KMZ/KML'}
      </Button>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
        <input type="checkbox" checked={props.showPreview} onChange={e => props.onTogglePreview(e.target.checked)}/>
        Mostrar rotas não vinculadas e pontos de referência
      </label>
      {!!props.message && <small style={{ color: props.message.startsWith('Erro') ? '#ff7b8c' : '#b9e8ff', overflowWrap: 'anywhere' }}>{props.message}</small>}
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant={tab === 'waypoints' ? 'primary' : 'secondary'} onClick={() => { setTab('waypoints'); setSearch(''); }}>
          Pontos ({props.waypoints.length})
        </Button>
        <Button size="sm" variant={tab === 'routes' ? 'primary' : 'secondary'} onClick={() => { setTab('routes'); setSearch(''); }}>
          Rotas ({props.routes.length})
        </Button>
      </div>
      <input style={control} value={search} onChange={e => setSearch(e.target.value)}
        placeholder={tab === 'waypoints' ? 'Pesquisar ponto ou POP...' : 'Pesquisar trajeto...'} />
      {tab === 'waypoints' ? (
        <>
          <small>POPs vinculados: {linkedCount}/{props.waypoints.length}. Clique na seta de um ponto para renomear ou converter.</small>
          {waypoints.length === 0 && <small>Nenhum ponto encontrado.</small>}
          {waypoints.map(point => <WaypointRow key={point.id} point={point} pops={props.pops}
            occupiedPopIds={occupiedPopIds} onRename={props.onRenameWaypoint} onCreatePop={props.onCreatePop}
            onAssociate={props.onAssociateWaypoint} onDisassociate={props.onDisassociateWaypoint}
            onLocate={props.onLocateWaypoint} />)}
          {props.waypoints.length > 0 && <Button size="sm" variant="secondary" onClick={props.onRemoveWaypoints}>
            Remover referências KMZ (POPs criados permanecem)
          </Button>}
        </>
      ) : (
        <>
          <small>Associe origem e destino às rotas para listá-las nos POPs. Fibras monitoradas também aparecem pelo vínculo com seus enlaces.</small>
          {routes.length === 0 && <small>Nenhuma rota encontrada.</small>}
          {routes.map(route => <RouteRow key={route.id} route={route} pops={props.pops}
            usedLinks={props.links.filter(link => link.routeId === route.id)}
            onUpdate={props.onUpdateRoute} onRemove={props.onRemoveRoute} onLocate={props.onLocateRoute}/>)}
        </>
      )}
      <Button size="sm" variant="secondary" onClick={props.onClose}>Fechar</Button>
    </>
  );
};
