import React, { useMemo, useState } from 'react';
import type { BackbonePop, BackboneLink } from '../types';
import type { QueryItem, LinkHealthState } from '../monitoring';
import { linkHealthReport, popEquipmentHealthReport } from '../monitoring';
import './operationSidebar.css';

type Kind = 'pop' | 'link';
type Drawer = 'alarmes' | 'rede' | 'busca' | null;
type Entry = {
  id: string;
  kind: Kind;
  name: string;
  status: LinkHealthState;
  reason: string;
};
interface Props {
  pops: BackbonePop[];
  links: BackboneLink[];
  items: QueryItem[];
  geojsonCount: number;
  layersEnabled: boolean;
  onSelectPop: (id: string) => void;
  onSelectLink: (id: string) => void;
  onOpenLayers: () => void;
}

const labels: Record<LinkHealthState, string> = {
  normal: 'NÃO CONFIG.', ok: 'OK', warning: 'ATENÇÃO', down: 'DOWN', 'no-data': 'SEM DADOS',
};
const severity: Record<LinkHealthState, number> = {
  down: 0, warning: 1, 'no-data': 2, normal: 3, ok: 4,
};
const isAlarm = (s: LinkHealthState) => s === 'down' || s === 'warning';

/**
 * Barra lateral do NOC. Apenas consulta: não modifica opções do dashboard.
 * DOWN e ATENÇÃO vêm das regras reais do painel, sem inventar alarmes.
 */
export const OperationSidebar: React.FC<Props> = ({
  pops, links, items, geojsonCount, layersEnabled,
  onSelectPop, onSelectLink, onOpenLayers,
}) => {
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [search, setSearch] = useState('');
  const entries = useMemo((): Entry[] => {
    const popEntries: Entry[] = pops.map(pop => {
      const report = popEquipmentHealthReport(pop, items);
      return {
        id: pop.id, kind: 'pop', name: pop.name, status: report.state,
        reason: report.downReason?.fieldName ?? report.warningReasons.map(r => r.fieldName).join(' · '),
      };
    });
    const linkEntries: Entry[] = links.map(link => {
      const report = linkHealthReport(link.alertRule, link.monitoringFields ?? [], items);
      return {
        id: link.id, kind: 'link', name: link.name, status: report.state,
        reason: report.downReason?.fieldName ?? report.warningReasons.map(r => r.fieldName).join(' · '),
      };
    });
    return [...popEntries, ...linkEntries].sort((a, b) =>
      severity[a.status] - severity[b.status] || a.name.localeCompare(b.name, 'pt-BR'));
  }, [pops, links, items]);

  const alarms = entries.filter(item => isAlarm(item.status));
  const criticalCount = entries.filter(item => item.status === 'down').length;
  const warningCount = entries.filter(item => item.status === 'warning').length;
  const upCount = entries.filter(item => item.status === 'ok').length;
  const noDataCount = entries.filter(item => item.status === 'no-data').length;
  const unconfiguredCount = entries.filter(item => item.status === 'normal').length;
  const shown = drawer === 'alarmes'
    ? alarms
    : drawer === 'busca'
      ? entries.filter(item => item.name.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')))
      : entries;

  const toggle = (next: Exclude<Drawer, null>) => setDrawer(current => current === next ? null : next);
  const openElement = (item: Entry) => {
    setDrawer(null);
    if (item.kind === 'pop') { onSelectPop(item.id); }
    else { onSelectLink(item.id); }
  };

  const renderEntry = (item: Entry) => (
    <button type="button" key={`${item.kind}-${item.id}`} className="teif-ops-entry" onClick={() => openElement(item)}
      title="Localizar no mapa e abrir os detalhes">
      <span className="teif-ops-entry-top">
        <span>{item.name}</span>
        <em className={`teif-status ${item.status}`}>{labels[item.status]}</em>
      </span>
      <small>{item.kind === 'pop' ? 'POP' : 'Enlace'}{item.reason ? ` · ${item.reason}` : ''}</small>
    </button>
  );

  return (
    <aside className={`teif-ops-shell ${drawer ? 'expanded' : 'collapsed'}`} aria-label="Barra de operação do mapa">
      {drawer && (
        <section className="teif-ops-drawer" aria-label={`Painel de ${drawer}`}>
          <div className="teif-ops-header">
            <div><strong>{drawer === 'alarmes' ? 'Alarmes da rede' : drawer === 'busca' ? 'Pesquisar rede' : 'Visão da rede'}</strong>
              </div>
            <button type="button" onClick={() => setDrawer(null)} title="Fechar painel" aria-label="Fechar painel">×</button>
          </div>
          <div className="teif-ops-scroll">
            {drawer === 'alarmes' ? (
              <>
                <div className="teif-ops-states">
                  <div><i className="teif-dot down"/> Falhas <strong>{criticalCount}</strong></div>
                  <div><i className="teif-dot warning"/> Atenção <strong>{warningCount}</strong></div>
                </div>
                <small className="teif-ops-footnote">Apenas condições detectadas por regras e dados do Zabbix. Sem dados não conta como falha.</small>
                <div className="teif-ops-section-title">Ocorrências ({alarms.length})</div>
                {alarms.length ? <div className="teif-ops-results">{alarms.slice(0, 120).map(renderEntry)}</div>
                  : <p className="teif-ops-empty">Nenhum alarme ativo confirmado.</p>}
              </>
            ) : drawer === 'rede' ? (
              <>
                <div className="teif-ops-counters">
                  <div><strong>{pops.length}</strong><small>POPs</small></div>
                  <div><strong>{links.length}</strong><small>Enlaces</small></div>
                  <div><strong>{geojsonCount.toLocaleString('pt-BR')}</strong><small>Geometrias</small></div>
                </div>
                <div className="teif-ops-section-title">Estados</div>
                <div className="teif-ops-states">
                  <div><i className="teif-dot ok"/> OK <strong>{upCount}</strong></div>
                  <div><i className="teif-dot down"/> Down <strong>{criticalCount}</strong></div>
                  <div><i className="teif-dot warning"/> Atenção <strong>{warningCount}</strong></div>
                  <div><i className="teif-dot no-data"/> Sem dados <strong>{noDataCount}</strong></div>
                  <div><i className="teif-dot normal"/> Não configurados <strong>{unconfiguredCount}</strong></div>
                </div>
                <small className="teif-ops-footnote">Elementos sem regras configuradas não são considerados UP.</small>
                <div className="teif-ops-section-title">POPs e enlaces ({entries.length})</div>
                <div className="teif-ops-results">{shown.slice(0, 120).map(renderEntry)}</div>
              </>
            ) : (
              <>
                <input className="teif-ops-search" value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Nome do POP ou enlace..." aria-label="Pesquisar POP ou enlace" />
                <div className="teif-ops-section-title">Resultados ({shown.length})</div>
                <div className="teif-ops-results">{shown.slice(0, 120).map(renderEntry)}</div>
                {!shown.length && <p className="teif-ops-empty">Nenhum POP ou enlace encontrado.</p>}
              </>
            )}
            {shown.length > 120 && <small className="teif-ops-footnote">Mostrando os primeiros 120; refine a pesquisa para encontrar outros.</small>}
          </div>
        </section>
      )}
      <nav className="teif-ops-rail" aria-label="Atalhos da rede">
        <button type="button" className={`teif-rail-button teif-rail-alert ${alarms.length ? 'has-alarm' : 'no-alarm'} ${drawer === 'alarmes' ? 'active' : ''}`}
          title={alarms.length ? `${alarms.length} alarmes ativos` : 'Nenhum alarme ativo confirmado'}
          aria-label={`Alarmes: ${alarms.length}`} aria-expanded={drawer === 'alarmes'}
          onClick={() => toggle('alarmes')}>
          <span className="teif-rail-bang" aria-hidden="true">!</span>
          {alarms.length > 0 && <span className="teif-rail-count">{alarms.length > 99 ? '99+' : alarms.length}</span>}
        </button>
        <button type="button" className={`teif-rail-button ${drawer === 'rede' ? 'active' : ''}`}
          title="Rede: POPs, enlaces e estados" aria-label="Consultar rede"
          aria-expanded={drawer === 'rede'} onClick={() => toggle('rede')}>
          <span aria-hidden="true" className="teif-rail-symbol">◎</span>
        </button>
        <button type="button" className={`teif-rail-button ${drawer === 'busca' ? 'active' : ''}`}
          title="Pesquisar POP ou enlace" aria-label="Pesquisar POP ou enlace"
          aria-expanded={drawer === 'busca'} onClick={() => toggle('busca')}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>
          </svg>
        </button>
        <button type="button" className="teif-rail-button" title="Camadas do mapa" aria-label="Abrir camadas do mapa"
          disabled={!layersEnabled} onClick={onOpenLayers}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>
          </svg>
        </button>
      </nav>
    </aside>
  );
};
