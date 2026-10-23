import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PanelProps } from '@grafana/data';
import { Button } from '@grafana/ui';
import { availableQueryIds, availableQueryItems, linkHealthReport, popHealthReport } from '../monitoring';
import type { LinkAlertReason } from '../monitoring';
import { MonitorFieldsEditor, MonitorFieldsReadout } from './MonitorFieldsEditor';
import { importMapFile, validateGeometry } from '../kmz';
import { KmzManager } from './KmzManager';
import { linksConnectedToPop, nearbyPop, routesConnectedToPop } from '../kmzAssociations';
import type { AlertOperator, LinkAlertRule, MonitorField, PopAlertRule } from '../types';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './linkStatus.css';
import './popStatus.css';
import './editorLayout.css';

import type {
  BackbonePop,
  BackboneLink,
  SimpleOptions,
  ImportedRoute,
  ImportedWaypoint,
} from '../types';

type Props = PanelProps<SimpleOptions>;

// ========================================
// CONFIGURAÇÕES INICIAIS
// ========================================

const DEFAULT_VIEW = {
  latitude: -24.18,
  longitude: -46.79,
  zoom: 10,
};

// ========================================
// APARÊNCIA DOS POPs
// ========================================

// X permanente durante alerta: fundo pulsa, caractere branco não some.
const alertXIcon = L.divIcon({
  className: 'teif-link-alert-x-icon',
  html: '<span class="teif-link-alert-x-mark" aria-hidden="true">X</span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/** Centro da parte VISÍVEL da linha reta (mesmo com um dos POPs fora da tela). */
function visibleLinkCenter(map: L.Map, from: L.LatLng, to: L.LatLng): L.LatLng {
  const a = map.latLngToContainerPoint(from);
  const b = map.latLngToContainerPoint(to);
  const w = map.getSize().x;
  const h = map.getSize().y;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let enter = 0;
  let exit = 1;
  // Clipping paramétrico (Liang–Barsky) no retângulo da viewport.
  const constraints = [
    [-dx, a.x], [dx, w - a.x], [-dy, a.y], [dy, h - a.y],
  ];
  for (const [p, q] of constraints) {
    if (p === 0) {
      if (q < 0) { return L.latLng((from.lat + to.lat) / 2, (from.lng + to.lng) / 2); }
    } else {
      const ratio = q / p;
      if (p < 0) { enter = Math.max(enter, ratio); }
      else { exit = Math.min(exit, ratio); }
      if (enter > exit) { break; }
    }
  }
  const t = enter <= exit ? (enter + exit) / 2 : 0.5;
  return map.containerPointToLatLng(L.point(a.x + dx * t, a.y + dy * t));
}

/**
 * Centro da parte visível de uma rota CURVA, medido pelo comprimento na tela.
 * Em um KMZ com curvas, o meio da linha reta entre POPs não representa a fibra.
 */
function visibleRouteCenter(map: L.Map, segments: L.LatLng[][], fallbackA: L.LatLng, fallbackB: L.LatLng): L.LatLng {
  type VisibleLeg = { start: L.Point; end: L.Point; distance: number };
  const legs: VisibleLeg[] = [];
  const width = map.getSize().x;
  const height = map.getSize().y;
  for (const segment of segments) {
    for (let i = 1; i < segment.length; i++) {
      const a = map.latLngToContainerPoint(segment[i - 1]);
      const b = map.latLngToContainerPoint(segment[i]);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      let low = 0;
      let high = 1;
      let rejected = false;
      for (const [coef, limit] of [[-dx, a.x], [dx, width - a.x], [-dy, a.y], [dy, height - a.y]]) {
        if (coef === 0) {
          if (limit < 0) { rejected = true; break; }
        } else {
          const t = limit / coef;
          if (coef < 0) { low = Math.max(low, t); }
          else { high = Math.min(high, t); }
        }
      }
      if (rejected || low >= high) { continue; }
      const start = L.point(a.x + low * dx, a.y + low * dy);
      const end = L.point(a.x + high * dx, a.y + high * dy);
      const distance = start.distanceTo(end);
      if (distance > 0) { legs.push({ start, end, distance }); }
    }
  }
  const total = legs.reduce((sum, leg) => sum + leg.distance, 0);
  if (total <= 0) { return visibleLinkCenter(map, fallbackA, fallbackB); }
  let remaining = total / 2;
  for (const leg of legs) {
    if (remaining <= leg.distance) {
      const t = remaining / leg.distance;
      return map.containerPointToLatLng(L.point(
        leg.start.x + (leg.end.x - leg.start.x) * t,
        leg.start.y + (leg.end.y - leg.start.y) * t
      ));
    }
    remaining -= leg.distance;
  }
  return map.containerPointToLatLng(legs[legs.length - 1].end);
}

function leafletRouteSegments(route: ImportedRoute): L.LatLng[][] {
  return route.segments.map((part) => part.map(([lat, lon]) => L.latLng(lat, lon)));
}

function zoomToRoute(map: L.Map | null, route: ImportedRoute): void {
  if (!map) { return; }
  const segments = leafletRouteSegments(route);
  const bounds = L.latLngBounds(segments.flat());
  if (bounds.isValid()) { map.fitBounds(bounds.pad(0.08), { maxZoom: 16 }); }
}

/** Ícones Leaflet gerados conforme o resultado real das métricas do POP. */
function popIconForState(state: 'normal' | 'ok' | 'warning' | 'down' | 'no-data'): L.DivIcon {
  return L.divIcon({
    className: `teif-pop-marker teif-pop-${state}`,
    html: `<span class="teif-pop-status-core" aria-hidden="true">${state === 'down' ? '<span class="teif-pop-status-x">X</span>' : ''}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// ========================================
// APARÊNCIA DAS JANELAS
// ========================================

const cardStyle: React.CSSProperties = {
  background: 'rgba(18, 26, 40, 0.97)',
  color: '#ffffff',
  padding: 12,
  borderRadius: 6,
  border: '1px solid #405065',
  width: 260,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  pointerEvents: 'auto',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 8,
  color: '#ffffff',
  background: '#111827',
  border: '1px solid #526174',
  borderRadius: 4,
};

// Editor responsivo: rola dentro do painel, sem empurrar botoes para fora do mapa.
const editorCardStyle: React.CSSProperties = {
  ...cardStyle,
  width: 390,
  maxWidth: '100%',
  maxHeight: '100%',
  minHeight: 0,
  minWidth: 0,
  boxSizing: 'border-box',
  flex: '0 1 auto',
  overflowY: 'auto',
  overflowX: 'hidden',
  overscrollBehavior: 'contain',
};

// Detalhes do alerta para diagnóstico no NOC, sem duplicar a lógica de thresholds.
const AlertReasons: React.FC<{
  title: string;
  reasons: LinkAlertReason[];
  tone: 'warning' | 'down';
}> = ({ title, reasons, tone }) => {
  if (reasons.length === 0) { return null; }
  const accent = tone === 'down' ? '#ff6675' : '#facc15';
  return (
    <div style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <strong style={{ color: accent, fontSize: 12 }}>{title}</strong>
      {reasons.map((reason) => (
        <div key={reason.fieldId} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
          <strong style={{ overflowWrap: 'anywhere' }}>{reason.fieldName}</strong>
          <span style={{ color: '#dbe7f5', overflowWrap: 'anywhere' }}>
            Atual: {reason.actual} {reason.operator} Limite: {reason.threshold}
          </span>
        </div>
      ))}
    </div>
  );
};

// ========================================
// COMPONENTE PRINCIPAL
// ========================================

export const SimplePanel: React.FC<Props> = ({
  width,
  height,
  options,
  onOptionsChange,
  data,
}) => {
  // ======================================
  // REFERÊNCIAS DO LEAFLET
  // ======================================

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const markersRef = useRef<L.LayerGroup | null>(null);
  const linksRef = useRef<L.LayerGroup | null>(null);
  const kmzPreviewRef = useRef<L.LayerGroup | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mantém as opções atualizadas nos eventos
  const optionsRef = useRef(options);
  const changeRef = useRef(onOptionsChange);

  useEffect(() => {
    optionsRef.current = options;
    changeRef.current = onOptionsChange;
  }, [options, onOptionsChange]);

  // ======================================
  // CONFIGURAÇÕES GEOGRÁFICAS
  // ======================================

  const latitude =
    options.latitude ?? DEFAULT_VIEW.latitude;

  const longitude =
    options.longitude ?? DEFAULT_VIEW.longitude;

  const zoom =
    options.zoom ?? DEFAULT_VIEW.zoom;

  const initialView = useRef({
    latitude,
    longitude,
    zoom,
  });

  const pops = options.pops ?? [];
  const links = options.links ?? [];
  const importedRoutes = options.importedRoutes ?? [];
  const importedWaypoints = options.importedWaypoints ?? [];

  // Query A/B/C... e itens realmente retornados pelo Grafana.
  const queryIds = useMemo(() => availableQueryIds(data), [data]);
  const queryItems = useMemo(() => availableQueryItems(data.series), [data.series]);

  // ======================================
  // ESTADOS DO EDITOR
  // ======================================

  const [editMode, setEditMode] = useState(false);

  // POPs
  const [adding, setAdding] = useState(false);
  const [popFormOpen, setPopFormOpen] = useState(false);

  const [pendingPosition, setPendingPosition] =
    useState<L.LatLng | null>(null);

  const [newName, setNewName] = useState('');
  const [popCreationMethod, setPopCreationMethod] = useState<'map' | 'coordinates'>('map');
  const [manualLatitude, setManualLatitude] = useState('');
  const [manualLongitude, setManualLongitude] = useState('');
  const [popFormMessage, setPopFormMessage] = useState('');

  // Coordenadas são decimais em graus; aceita vírgula decimal em pt-BR.
  const parseDecimalCoordinate = (text: string): number | undefined => {
    const normalized = text.trim().replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) { return undefined; }
    const number = Number(normalized);
    return Number.isFinite(number) ? number : undefined;
  };
  const enteredLatitude = parseDecimalCoordinate(manualLatitude);
  const enteredLongitude = parseDecimalCoordinate(manualLongitude);
  const enteredCoordinatesValid = enteredLatitude !== undefined && enteredLongitude !== undefined &&
    Math.abs(enteredLatitude) <= 90 && Math.abs(enteredLongitude) <= 180;

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] =
    useState(false);

  // Enlaces
  const [kmzManagerOpen, setKmzManagerOpen] = useState(false);
  const [kmzLoading, setKmzLoading] = useState(false);
  const [kmzMessage, setKmzMessage] = useState('');
  const [creatingLink, setCreatingLink] =
    useState(false);

  const [linkOriginId, setLinkOriginId] =
    useState<string | null>(null);
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkRouteId, setLinkRouteId] = useState('');
  const [linkCreateMessage, setLinkCreateMessage] = useState('');

  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [editLinkName, setEditLinkName] = useState('');
  const [confirmDeleteLink, setConfirmDeleteLink] = useState(false);

  const selectedPop = pops.find(
    (pop) => pop.id === selectedId
  );
  const selectedPopReport = selectedPop
    ? popHealthReport(selectedPop.alertRule, selectedPop.monitoringFields ?? [], queryItems)
    : null;

  const originPop = pops.find(
    (pop) => pop.id === linkOriginId
  );
  const selectedLink = links.find((link) => link.id === selectedLinkId);
  const selectedLinkReport = selectedLink
    ? linkHealthReport(selectedLink.alertRule, selectedLink.monitoringFields ?? [], queryItems)
    : null;

  // Atualizações mantêm os dados existentes e escrevem no JSON do painel.
  const changeCurrentOptions = (next: SimpleOptions) => {
    optionsRef.current = next;
    changeRef.current(next);
  };

  const handleKmlImport = async (file: File | undefined): Promise<void> => {
    if (!file) { return; }
    setKmzLoading(true);
    setKmzMessage('Lendo o arquivo KMZ/KML...');
    try {
      const parsed = await importMapFile(file);
      const current = optionsRef.current;
      const allRoutes = [...(current.importedRoutes ?? []), ...parsed.routes];
      const allWaypoints = [...(current.importedWaypoints ?? []), ...parsed.waypoints];
      validateGeometry({ routes: allRoutes, waypoints: allWaypoints });
      changeCurrentOptions({
        ...current,
        importedRoutes: allRoutes,
        importedWaypoints: allWaypoints,
        showKmzPreview: true,
      });
      setKmzMessage(`Importados ${parsed.routes.length} trajetos e ${parsed.waypoints.length} pontos. Associe um trajeto em Editar enlace.`);
      const positions = [
        ...parsed.routes.flatMap((route) => route.segments.flat()),
        ...parsed.waypoints.map((point) => point.position),
      ];
      if (mapRef.current && positions.length) {
        const bounds = L.latLngBounds(positions);
        if (bounds.isValid()) { mapRef.current.fitBounds(bounds.pad(0.07), { maxZoom: 16 }); }
      }
    } catch (error) {
      setKmzMessage(`Erro ao importar: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setKmzLoading(false);
    }
  };

  const deleteImportedRoute = (routeId: string) => {
    const current = optionsRef.current;
    const inUse = (current.links ?? []).some((link) => link.routeId === routeId);
    if (inUse) {
      setKmzMessage('Rota associada a um enlace. Primeiro escolha Linha reta nesse enlace.');
      return;
    }
    changeCurrentOptions({ ...current,
      importedRoutes: (current.importedRoutes ?? []).filter((route) => route.id !== routeId),
    });
    setKmzMessage('Trajeto removido do painel.');
  };

  const deleteImportedWaypoints = () => {
    const current = optionsRef.current;
    changeCurrentOptions({
      ...current,
      importedWaypoints: [],
      pops: (current.pops ?? []).map((pop) => ({ ...pop, importedWaypointId: undefined })),
    });
    setKmzMessage('Pontos de referência removidos. Os POPs permanecem intactos.');
  };

  const renameWaypoint = (waypointId: string, name: string) => {
    const current = optionsRef.current;
    changeCurrentOptions({
      ...current,
      importedWaypoints: (current.importedWaypoints ?? []).map((point) =>
        point.id === waypointId ? { ...point, name: name.trim().slice(0, 120) } : point),
    });
  };

  const createPopFromWaypoint = (waypointId: string) => {
    const current = optionsRef.current;
    const point = (current.importedWaypoints ?? []).find((item) => item.id === waypointId);
    if (!point || point.linkedPopId) { return; }
    const existing = nearbyPop(point.position, current.pops ?? [], 10);
    if (existing) {
      setKmzMessage(`Já existe POP próximo (${existing.name}). Use a opção Vincular POP existente.`);
      return;
    }
    const newPop: BackbonePop = {
      id: `pop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: point.name,
      latitude: Number(point.position[0].toFixed(6)),
      longitude: Number(point.position[1].toFixed(6)),
      importedWaypointId: point.id,
    };
    changeCurrentOptions({
      ...current,
      pops: [...(current.pops ?? []), newPop],
      importedWaypoints: (current.importedWaypoints ?? []).map((item) =>
        item.id === point.id ? { ...item, linkedPopId: newPop.id } : item),
    });
    setKmzMessage(`Ponto ${point.name} convertido em POP. Clique no marcador para configurar monitoramento.`);
  };

  const associateWaypointToPop = (waypointId: string, popId: string) => {
    const current = optionsRef.current;
    const pop = (current.pops ?? []).find((item) => item.id === popId);
    const point = (current.importedWaypoints ?? []).find((item) => item.id === waypointId);
    if (!pop || !point) { return; }
    if ((current.importedWaypoints ?? []).some((item) => item.id !== waypointId && item.linkedPopId === popId)) {
      setKmzMessage('Esse POP já está associado a outro ponto KMZ.');
      return;
    }
    changeCurrentOptions({
      ...current,
      pops: (current.pops ?? []).map((item) => item.id === popId
        ? { ...item, importedWaypointId: waypointId }
        : item.id === point.linkedPopId ? { ...item, importedWaypointId: undefined } : item),
      importedWaypoints: (current.importedWaypoints ?? []).map((item) =>
        item.id === waypointId ? { ...item, linkedPopId: popId } : item),
    });
    setKmzMessage(`Ponto ${point.name} associado ao POP ${pop.name}.`);
  };

  const disassociateWaypoint = (waypointId: string) => {
    const current = optionsRef.current;
    changeCurrentOptions({
      ...current,
      importedWaypoints: (current.importedWaypoints ?? []).map((item) =>
        item.id === waypointId ? { ...item, linkedPopId: undefined } : item),
      pops: (current.pops ?? []).map((pop) =>
        pop.importedWaypointId === waypointId ? { ...pop, importedWaypointId: undefined } : pop),
    });
    setKmzMessage('Vínculo removido; nenhum POP foi excluído.');
  };

  const updateImportedRoute = (routeId: string, patch: Partial<ImportedRoute>) => {
    const current = optionsRef.current;
    changeCurrentOptions({
      ...current,
      importedRoutes: (current.importedRoutes ?? []).map((route) => route.id === routeId ? { ...route, ...patch } : route),
    });
  };

  const locateWaypoint = (point: ImportedWaypoint) => {
    mapRef.current?.setView(point.position, Math.max(mapRef.current.getZoom(), 15));
  };

  const updatePopProperties = (popId: string, patch: Partial<BackbonePop>) => {
    const current = optionsRef.current;
    changeCurrentOptions({
      ...current,
      pops: (current.pops ?? []).map((pop) => {
        if (pop.id !== popId) { return pop; }
        const next = { ...pop, ...patch };
        // Remove regra DOWN órfã quando o campo de status é excluído.
        if (patch.monitoringFields && next.alertRule &&
          !patch.monitoringFields.some((field) => field.id === next.alertRule?.fieldId)) {
          next.alertRule = undefined;
        }
        return next;
      }),
    });
  };

  const updatePopMonitoringFields = (popId: string, fields: MonitorField[]) => {
    updatePopProperties(popId, { monitoringFields: fields });
  };

  const updateLinkProperties = (linkId: string, patch: Partial<BackboneLink>) => {
    const current = optionsRef.current;
    changeCurrentOptions({
      ...current,
      links: (current.links ?? []).map((link) => {
        if (link.id !== linkId) { return link; }
        const next = { ...link, ...patch };
        // Se o usuário remove o campo controlador, remove também a regra antiga.
        if (patch.monitoringFields && next.alertRule &&
            !patch.monitoringFields.some((field) => field.id === next.alertRule?.fieldId)) {
          next.alertRule = undefined;
        }
        return next;
      }),
    });
  };

  // ======================================
  // 1. INICIALIZAÇÃO DO MAPA
  // ======================================

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const initial = initialView.current;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
    }).setView(
      [initial.latitude, initial.longitude],
      initial.zoom
    );

    // OpenStreetMap
    L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }
    ).addTo(map);

    // Rotas de referência ficam abaixo dos enlaces monitorados.
    const kmzPreviewGroup = L.layerGroup().addTo(map);

    // Camada dos enlaces
    const linkGroup = L.layerGroup().addTo(map);

    // Camada dos POPs
    const markerGroup = L.layerGroup().addTo(map);

    // Guardar referências
    mapRef.current = map;
    linksRef.current = linkGroup;
    kmzPreviewRef.current = kmzPreviewGroup;
    markersRef.current = markerGroup;

    const frame = requestAnimationFrame(() => {
      map.invalidateSize();
    });

    // Limpeza
    return () => {
      cancelAnimationFrame(frame);

      map.remove();

      mapRef.current = null;
      markersRef.current = null;
      linksRef.current = null;
      kmzPreviewRef.current = null;
    };
  }, []);

  // ======================================
  // 2. ATUALIZAR POSIÇÃO DO MAPA
  // ======================================

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const target = L.latLng(latitude, longitude);

    if (
      !map.getCenter().equals(target, 0.000001) ||
      map.getZoom() !== zoom
    ) {
      map.setView(target, zoom);
    }
  }, [latitude, longitude, zoom]);

  // ======================================
  // 3. REDIMENSIONAMENTO
  // ======================================

  useEffect(() => {
    mapRef.current?.invalidateSize({
      pan: false,
    });
  }, [width, height]);

  // ======================================
  // KMZ — ROTAS NÃO VINCULADAS E PONTOS DE REFERÊNCIA
  // ======================================
  useEffect(() => {
    const group = kmzPreviewRef.current;
    if (!group) { return; }
    group.clearLayers();
    if (!(options.showKmzPreview ?? false)) { return; }
    const usedIds = new Set((options.links ?? []).map((link) => link.routeId));
    for (const route of options.importedRoutes ?? []) {
      if (usedIds.has(route.id)) { continue; }
      const polyline = L.polyline(leafletRouteSegments(route), {
        color: '#59bfe8', weight: 3, opacity: 0.6,
        dashArray: '6 7', interactive: true,
      }).addTo(group);
      const tooltip = document.createElement('span');
      tooltip.textContent = `KMZ: ${route.name} — não vinculada`;
      polyline.bindTooltip(tooltip, { sticky: true });
    }
    for (const waypoint of options.importedWaypoints ?? []) {
      if (waypoint.linkedPopId && (options.pops ?? []).some((pop) => pop.id === waypoint.linkedPopId)) {
        continue; // já aparece como marcador de POP monitorável
      }
      const marker = L.circleMarker(waypoint.position, {
        color: '#86eaff', fillColor: '#132c46', weight: 2,
        radius: 5, fillOpacity: 0.8, bubblingMouseEvents: false,
      }).addTo(group);
      const label = document.createElement('span');
      label.textContent = `KMZ: ${waypoint.name} (referência)`;
      marker.bindTooltip(label);
    }
  }, [options.importedRoutes, options.importedWaypoints, options.pops, options.links, options.showKmzPreview]);

  // ======================================
  // 4. DESENHAR ENLACES + STATUS
  // ======================================

  useEffect(() => {
    const group = linksRef.current;
    const map = mapRef.current;
    if (!group || !map) { return; }

    group.clearLayers();
    const alerts: Array<{ icon: L.Marker; segments: L.LatLng[][]; from: L.LatLng; to: L.LatLng }> = [];

    for (const link of options.links ?? []) {
      const origin = (options.pops ?? []).find((pop) => pop.id === link.sourcePopId);
      const destination = (options.pops ?? []).find((pop) => pop.id === link.targetPopId);
      if (!origin || !destination) { continue; }

      const from = L.latLng(origin.latitude, origin.longitude);
      const to = L.latLng(destination.latitude, destination.longitude);
      const assignedRoute = (options.importedRoutes ?? []).find((route) => route.id === link.routeId);
      const segments: L.LatLng[][] = assignedRoute ? leafletRouteSegments(assignedRoute) : [[from, to]];
      const points: L.LatLng[][] = segments;
      const report = linkHealthReport(link.alertRule, link.monitoringFields ?? [], queryItems);
      const state = report.state;
      const weight = link.width || 4;

      // Contorno escuro fixo durante o alerta: cabo NUNCA desaparece no pulso.
      if (state === 'down' || state === 'warning') {
        L.polyline(points, {
          color: state === 'down' ? '#4d111a' : '#665012', weight: weight + 4, opacity: 1, interactive: false,
        }).addTo(group);
      }

      L.polyline(points, {
        color: state === 'down' ? '#a51c29' : state === 'warning' ? '#facc15' : state === 'no-data' ? '#9299a6' : (link.color || '#00ff66'),
        weight,
        opacity: state === 'down' || state === 'warning' ? 1 : 0.9,
        dashArray: state === 'no-data' ? '8 7' : undefined,
        className: state === 'down' ? 'teif-link-alert-stroke' : undefined,
        interactive: false,
      }).addTo(group);

      if (state === 'down') {
        const marker = L.marker(visibleRouteCenter(map, segments, from, to), {
          icon: alertXIcon,
          interactive: false,
          keyboard: false,
          bubblingMouseEvents: false,
          zIndexOffset: 900,
        }).addTo(group);
        alerts.push({ icon: marker, segments, from, to });
      }

      // Área invisível mais larga: mantém o clique acessível no cabo.
      const label = document.createElement('span');
      const stateLabel = state === 'down' ? 'DOWN' :
        state === 'warning' ? 'ATENÇÃO' : state === 'no-data' ? 'SEM DADOS' : state === 'ok' ? 'NORMAL' : '';
      const reasons = state === 'down' && report.downReason
        ? [report.downReason.fieldName]
        : state === 'warning' ? report.warningReasons.map((reason) => reason.fieldName) : [];
      label.textContent = `${link.name}${assignedRoute ? ` | KMZ: ${assignedRoute.name}` : ''}${stateLabel ? ` — ${stateLabel}` : ''}${reasons.length ? ` (${reasons.join(', ')})` : ''}`;
      const hitLine = L.polyline(points, {
        color: '#fff',
        weight: Math.max(14, weight + 10),
        opacity: 0.01,
        interactive: true,
        bubblingMouseEvents: false,
      }).addTo(group);
      hitLine.bindTooltip(label, { sticky: true });
      hitLine.on('click', () => {
        if (adding || creatingLink) { return; }
        setSelectedLinkId(link.id);
        setEditLinkName(link.name);
        setConfirmDeleteLink(false);
        setSelectedId(null);
        setConfirmDelete(false);
      });
    }

    // Mantém o X no meio da PARTE VISÍVEL do enlace ao mover ou ampliar o mapa.
    const updateXPositions = () => {
      for (const alert of alerts) {
        alert.icon.setLatLng(visibleRouteCenter(map, alert.segments, alert.from, alert.to));
      }
    };
    map.on('moveend zoomend resize', updateXPositions);
    return () => { map.off('moveend zoomend resize', updateXPositions); };
  }, [options.pops, options.links, options.importedRoutes, adding, creatingLink, queryItems]);

  // Criação compartilhada entre cliques no mapa e seleção por listas.
  const createLinkBetween = (sourcePopId: string, targetPopId: string, desiredRouteId = ''): boolean => {
    const current = optionsRef.current;
    const origin = (current.pops ?? []).find((item) => item.id === sourcePopId);
    const destination = (current.pops ?? []).find((item) => item.id === targetPopId);
    if (!origin || !destination || origin.id === destination.id) {
      setLinkCreateMessage('Selecione dois POPs diferentes e válidos.');
      return false;
    }
    const newLink: BackboneLink = {
      id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: `${origin.name} - ${destination.name}`,
      sourcePopId: origin.id,
      targetPopId: destination.id,
      color: '#00FF66',
      width: 4,
      routeId: (current.importedRoutes ?? []).some((route) => route.id === desiredRouteId)
        ? desiredRouteId : undefined,
    };
    changeCurrentOptions({ ...current, links: [...(current.links ?? []), newLink] });
    setCreatingLink(false);
    setLinkOriginId(null);
    setLinkTargetId('');
    setLinkRouteId('');
    setLinkCreateMessage('');
    setSelectedLinkId(newLink.id);
    setEditLinkName(newLink.name);
    return true;
  };

  // ======================================
  // 5. DESENHAR POPs
  // ======================================

  useEffect(() => {
    const group = markersRef.current;

    if (!group) {
      return;
    }

    group.clearLayers();

    for (const pop of options.pops ?? []) {
      const report = popHealthReport(pop.alertRule, pop.monitoringFields ?? [], queryItems);
      const state = report.state;
      const marker = L.marker(
        [pop.latitude, pop.longitude],
        {
          icon: popIconForState(state),
          draggable: editMode && !creatingLink,
          bubblingMouseEvents: false,
        }
      ).addTo(group);

      // Nome e diagnóstico rápido. textContent evita interpretar texto de query como HTML.
      const label = document.createElement('span');
      const statusLabel = state === 'down' ? 'DOWN' :
        state === 'warning' ? 'ATENÇÃO' : state === 'no-data' ? 'SEM DADOS' : state === 'ok' ? 'NORMAL' : '';
      const reasons = state === 'down' && report.downReason
        ? [report.downReason.fieldName] :
        state === 'warning' ? report.warningReasons.map((reason) => reason.fieldName) : [];
      label.textContent = `${pop.name}${statusLabel ? ` — ${statusLabel}` : ''}${reasons.length ? ` (${reasons.join(', ')})` : ''}`;

      marker.bindTooltip(label, {
        permanent: true,
        direction: 'top',
        offset: [0, -12],
      });

      // ==================================
      // CLIQUE NO POP
      // ==================================

      marker.on('click', () => {
        // Criação de enlace
        if (creatingLink) {
          // Primeiro POP
          if (!linkOriginId) {
            setLinkOriginId(pop.id);
            return;
          }

          // Impedir ligação consigo mesmo
          if (linkOriginId === pop.id) {
            return;
          }

          createLinkBetween(linkOriginId, pop.id, linkRouteId);
          return;
        }

        // Clicar no POP abre edição (modo edição) ou indicadores (modo normal).
        setSelectedId(pop.id);
        setEditName(pop.name);
        setConfirmDelete(false);
        setSelectedLinkId(null);
      });

      // ==================================
      // MOVIMENTAR POP
      // ==================================

      marker.on('dragend', () => {
        if (!editMode || creatingLink) {
          return;
        }

        const point = marker.getLatLng();
        const current = optionsRef.current;

        const updated = (current.pops ?? []).map(
          (item) =>
            item.id === pop.id
              ? {
                  ...item,
                  latitude: Number(
                    point.lat.toFixed(6)
                  ),
                  longitude: Number(
                    point.lng.toFixed(6)
                  ),
                }
              : item
        );

        changeRef.current({
          ...current,
          pops: updated,
        });
      });
    }
  }, [
    options.pops,
    editMode,
    creatingLink,
    linkOriginId,
    linkRouteId,
    queryItems,
  ]);

  // ======================================
  // 6. CLIQUE PARA ADICIONAR POP
  // ======================================

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !adding || popCreationMethod !== 'map') {
      return;
    }

    const container = map.getContainer();

    container.style.cursor = 'crosshair';

    const handleClick = (
      event: L.LeafletMouseEvent
    ) => {
      setPendingPosition(event.latlng);
      setSelectedId(null);
      setSelectedLinkId(null);
      setAdding(false);
      setPopFormMessage('');
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
      container.style.cursor = '';
    };
  }, [adding, popCreationMethod]);

  // ======================================
  // 7. SALVAR POSIÇÃO ATUAL
  // ======================================

  const salvarPosicaoAtual = () => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const center = map.getCenter();
    const current = optionsRef.current;

    changeRef.current({
      ...current,
      latitude: Number(center.lat.toFixed(6)),
      longitude: Number(center.lng.toFixed(6)),
      zoom: map.getZoom(),
    });
  };

  // ======================================
  // 8. ADICIONAR POP
  // ======================================

  const adicionarPop = () => {
    const name = newName.trim();
    if (!name) { setPopFormMessage('Informe o nome do POP.'); return; }
    let lat: number;
    let lng: number;
    if (popCreationMethod === 'coordinates') {
      if (!enteredCoordinatesValid || enteredLatitude === undefined || enteredLongitude === undefined) {
        setPopFormMessage('Latitude deve estar entre -90 e 90; longitude entre -180 e 180.');
        return;
      }
      lat = enteredLatitude;
      lng = enteredLongitude;
    } else {
      if (!pendingPosition) { setPopFormMessage('Clique no mapa para definir a posição.'); return; }
      lat = pendingPosition.lat;
      lng = pendingPosition.lng;
    }
    const current = optionsRef.current;
    const near = nearbyPop([lat, lng], current.pops ?? [], 5);
    if (near && near.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')) {
      setPopFormMessage(`Já existe um POP com esse nome nessa posição (${near.name}).`);
      return;
    }
    const novoPop: BackbonePop = {
      id: `pop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
    };
    changeCurrentOptions({ ...current, pops: [...(current.pops ?? []), novoPop] });
    setPendingPosition(null);
    setAdding(false);
    setPopFormOpen(false);
    setNewName('');
    setManualLatitude('');
    setManualLongitude('');
    setPopFormMessage('');
    mapRef.current?.setView([lat, lng], Math.max(mapRef.current.getZoom(), 13));
  };

  // ======================================
  // 9. RENOMEAR POP
  // ======================================

  const renomearPop = () => {
    const name = editName.trim();

    if (!selectedId || !name) {
      return;
    }

    const current = optionsRef.current;

    changeRef.current({
      ...current,
      pops: (current.pops ?? []).map((pop) =>
        pop.id === selectedId
          ? { ...pop, name }
          : pop
      ),
    });
  };

  // ======================================
  // 10. EXCLUIR POP
  // ======================================

  const excluirPop = () => {
    if (!selectedId) {
      return;
    }

    const current = optionsRef.current;

    // Remove o POP e os enlaces conectados
    changeRef.current({
      ...current,

      pops: (current.pops ?? []).filter(
        (pop) => pop.id !== selectedId
      ),

      links: (current.links ?? []).filter(
        (link) =>
          link.sourcePopId !== selectedId &&
          link.targetPopId !== selectedId
      ),
      importedRoutes: (current.importedRoutes ?? []).map((route) => ({
        ...route,
        sourcePopId: route.sourcePopId === selectedId ? undefined : route.sourcePopId,
        targetPopId: route.targetPopId === selectedId ? undefined : route.targetPopId,
      })),
      importedWaypoints: (current.importedWaypoints ?? []).map((point) =>
        point.linkedPopId === selectedId ? { ...point, linkedPopId: undefined } : point),
    });

    setSelectedId(null);
    setConfirmDelete(false);
  };

  // ======================================
  // 11. ALTERNAR EDIÇÃO
  // ======================================

  const alternarEdicao = () => {
    if (editMode) {
      setAdding(false);
      setPopFormOpen(false);
      setPendingPosition(null);
      setSelectedId(null);
      setSelectedLinkId(null);
      setConfirmDelete(false);
      setConfirmDeleteLink(false);
      setCreatingLink(false);
      setLinkOriginId(null);
      setLinkTargetId('');
      setLinkRouteId('');
      setKmzManagerOpen(false);
    }

    setEditMode(!editMode);
  };

  // ======================================
  // 12. INICIAR OU CANCELAR ENLACE
  // ======================================

  const alternarCriacaoEnlace = () => {
    if (creatingLink) {
      setCreatingLink(false);
      setLinkOriginId(null);
      setLinkTargetId('');
      setLinkRouteId('');
      setLinkCreateMessage('');
      return;
    }

    setCreatingLink(true);
    setLinkOriginId(null);
    setLinkTargetId('');
    setLinkRouteId('');
    setLinkCreateMessage('');

    // Cancelar outros modos
    setAdding(false);
    setPopFormOpen(false);
    setPendingPosition(null);
    setSelectedId(null);
    setSelectedLinkId(null);
  };

  // ======================================
  // INTERFACE DO PLUGIN
  // ======================================

  return (
    <div
      className="teif-backbone-map"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml"
        style={{ display: 'none' }}
        onChange={(event) => {
          const selectedFile = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          void handleKmlImport(selectedFile);
        }}
      />

      {/* MAPA LEAFLET */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
        }}
      />

      {/* BARRA DE FERRAMENTAS */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 2000,
          height: 'calc(100% - 24px)',
          maxWidth: 'calc(100% - 24px)',
          minHeight: 0,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 6,
            pointerEvents: 'auto',
            flexShrink: 0,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            background: 'rgba(15, 23, 42, 0.96)',
            padding: 8,
            borderRadius: 8,
            border:
              '1px solid rgba(0, 255, 255, 0.65)',
            boxShadow:
              '0 4px 16px rgba(0, 0, 0, 0.5)',
          }}
        >
          <Button
            size="sm"
            variant="secondary"
            onClick={salvarPosicaoAtual}
          >
            Usar posição atual
          </Button>

          <Button
            size="sm"
            variant={editMode ? 'primary' : 'secondary'}
            onClick={alternarEdicao}
          >
            {editMode
              ? 'Concluir edição'
              : 'Editar POPs'}
          </Button>

          {editMode && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setAdding(true);
                setPopFormOpen(true);
                setPopCreationMethod('map');
                setNewName('');
                setManualLatitude('');
                setManualLongitude('');
                setPopFormMessage('');
                setCreatingLink(false);
                setLinkOriginId(null);
                setLinkTargetId('');
                setPendingPosition(null);
                setSelectedId(null);
                setSelectedLinkId(null);
                setKmzManagerOpen(false);
              }}
            >
              Adicionar POP
            </Button>
          )}

          {editMode && (
            <Button
              size="sm"
              variant={
                creatingLink ? 'primary' : 'secondary'
              }
              onClick={alternarCriacaoEnlace}
              disabled={pops.length < 2 && !creatingLink}
            >
              {creatingLink
                ? 'Cancelar enlace'
                : 'Criar enlace'}
            </Button>
          )}

          {editMode && (
            <Button
              size="sm"
              variant={kmzManagerOpen ? 'primary' : 'secondary'}
              onClick={() => {
                setKmzManagerOpen((open) => !open);
                setAdding(false);
                setPopFormOpen(false);
                setPendingPosition(null);
                setCreatingLink(false);
                setLinkOriginId(null);
                setLinkTargetId('');
                setSelectedId(null);
                setSelectedLinkId(null);
              }}
            >
              Rotas KMZ
            </Button>
          )}
        </div>

        {editMode && kmzManagerOpen && (
          <div className="teif-monitor-editor" style={editorCardStyle}>
            <KmzManager
              routes={importedRoutes}
              waypoints={importedWaypoints}
              pops={pops}
              links={links}
              showPreview={options.showKmzPreview ?? false}
              loading={kmzLoading}
              message={kmzMessage}
              onTogglePreview={(show) => changeCurrentOptions({ ...optionsRef.current, showKmzPreview: show })}
              onImport={() => fileInputRef.current?.click()}
              onClose={() => setKmzManagerOpen(false)}
              onRenameWaypoint={renameWaypoint}
              onCreatePop={createPopFromWaypoint}
              onAssociateWaypoint={associateWaypointToPop}
              onDisassociateWaypoint={disassociateWaypoint}
              onLocateWaypoint={locateWaypoint}
              onUpdateRoute={updateImportedRoute}
              onRemoveRoute={deleteImportedRoute}
              onLocateRoute={(route) => zoomToRoute(mapRef.current, route)}
              onRemoveWaypoints={deleteImportedWaypoints}
            />
          </div>
        )}

        {/* INSTRUÇÕES DE CRIAÇÃO DE ENLACE */}
        {creatingLink && (
          <div className="teif-monitor-editor" style={editorCardStyle}>
            <strong>Criar enlace</strong>
            <small>Selecione dois POPs existentes ou clique na origem e no destino diretamente no mapa.</small>
            <label style={{ fontSize: 12 }}>POP de origem</label>
            <select style={inputStyle} value={linkOriginId ?? ''} onChange={(event) => {
              setLinkOriginId(event.target.value || null);
              setLinkTargetId('');
              setLinkCreateMessage('');
            }}>
              <option value="">Selecione o POP de origem...</option>
              {pops.map((pop) => <option key={pop.id} value={pop.id}>{pop.name}</option>)}
            </select>
            <label style={{ fontSize: 12 }}>POP de destino</label>
            <select style={inputStyle} value={linkTargetId} onChange={(event) => {
              setLinkTargetId(event.target.value);
              setLinkCreateMessage('');
            }}>
              <option value="">Selecione o POP de destino...</option>
              {pops.filter((pop) => pop.id !== linkOriginId).map((pop) => (
                <option key={pop.id} value={pop.id}>{pop.name}</option>
              ))}
            </select>
            {importedRoutes.length > 0 && (
              <>
                <label style={{ fontSize: 12 }}>Trajeto KMZ (opcional)</label>
                <select style={inputStyle} value={linkRouteId} onChange={(event) => setLinkRouteId(event.target.value)}>
                  <option value="">Linha reta (pode alterar depois)</option>
                  {importedRoutes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}
                </select>
              </>
            )}
            {linkCreateMessage && <small style={{ color: '#ffb45c' }}>{linkCreateMessage}</small>}
            <Button size="sm" variant="primary"
              disabled={!linkOriginId || !linkTargetId || linkOriginId === linkTargetId}
              onClick={() => { if (linkOriginId) { createLinkBetween(linkOriginId, linkTargetId, linkRouteId); } }}>
              Criar enlace pelos POPs selecionados
            </Button>
            <small>Atalho no mapa: clique no primeiro POP e depois no segundo. Se houver fibras paralelas, você pode criar mais de um enlace entre os mesmos POPs.</small>
            <Button size="sm" variant="secondary" onClick={() => {
              setCreatingLink(false); setLinkOriginId(null); setLinkTargetId(''); setLinkRouteId('');
            }}>Cancelar</Button>
          </div>
        )}

        {popFormOpen && editMode && (
          <div className="teif-monitor-editor" style={editorCardStyle}>
            <strong>Adicionar POP</strong>
            <div style={{ display: 'flex', gap: 7 }}>
              <Button size="sm" variant={popCreationMethod === 'map' ? 'primary' : 'secondary'}
                onClick={() => { setPopCreationMethod('map'); setPendingPosition(null); setAdding(true); setPopFormMessage(''); }}>
                Clicar no mapa
              </Button>
              <Button size="sm" variant={popCreationMethod === 'coordinates' ? 'primary' : 'secondary'}
                onClick={() => { setPopCreationMethod('coordinates'); setAdding(false); setPendingPosition(null); setPopFormMessage(''); }}>
                Coordenadas
              </Button>
            </div>
            <label style={{ fontSize: 12 }}>Nome do POP</label>
            <input style={inputStyle} placeholder="Ex.: ITA_G5" maxLength={80}
              value={newName} onChange={(event) => setNewName(event.target.value)} />
            {popCreationMethod === 'map' ? (
              pendingPosition ? (
                <small>Posição escolhida: {pendingPosition.lat.toFixed(6)}, {pendingPosition.lng.toFixed(6)}</small>
              ) : (
                <small>Clique na posição desejada no mapa para preencher as coordenadas.</small>
              )
            ) : (
              <>
                <label style={{ fontSize: 12 }}>Latitude (graus decimais)</label>
                <input style={inputStyle} type="text" inputMode="decimal" placeholder="-24.254950"
                  value={manualLatitude} onChange={(event) => { setManualLatitude(event.target.value); setPopFormMessage(''); }}/>
                <label style={{ fontSize: 12 }}>Longitude (graus decimais)</label>
                <input style={inputStyle} type="text" inputMode="decimal" placeholder="-46.908702"
                  value={manualLongitude} onChange={(event) => { setManualLongitude(event.target.value); setPopFormMessage(''); }}/>
                <small>Use latitude, longitude em graus decimais. Aceita ponto ou vírgula como separador decimal.</small>
              </>
            )}
            {popFormMessage && <small style={{ color: '#ffb45c' }}>{popFormMessage}</small>}
            <Button size="sm" variant="primary" onClick={adicionarPop}
              disabled={!newName.trim() || (popCreationMethod === 'map' ? !pendingPosition : !enteredCoordinatesValid)}>
              Salvar POP
            </Button>
            <Button size="sm" variant="secondary" onClick={() => {
              setAdding(false); setPopFormOpen(false); setPendingPosition(null); setPopFormMessage('');
            }}>Cancelar</Button>
          </div>
        )}

        {/* EDIÇÃO DE POP */}
        {selectedPop && (
          <div className="teif-monitor-editor" style={editorCardStyle}>
            <strong>{editMode ? 'Editar POP' : selectedPop.name}</strong>

            {editMode ? (
              <>
            <input
              style={inputStyle}
              value={editName}
              maxLength={80}
              onChange={(event) =>
                setEditName(event.target.value)
              }
            />

            <small>
              Lat: {selectedPop.latitude.toFixed(6)}
              {' | '}
              Lon: {selectedPop.longitude.toFixed(6)}
            </small>

            <small>
              Arraste o marcador para movê-lo.
            </small>

            <Button
              size="sm"
              variant="primary"
              disabled={!editName.trim()}
              onClick={renomearPop}
            >
              Salvar nome
            </Button>

            {!confirmDelete ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfirmDelete(true)}
              >
                Excluir POP
              </Button>
            ) : (
              <>
                <small>
                  Os enlaces conectados também serão excluídos.
                </small>

                <Button
                  size="sm"
                  variant="primary"
                  onClick={excluirPop}
                >
                  Confirmar exclusão
                </Button>
              </>
            )}

            <MonitorFieldsEditor
              fields={selectedPop.monitoringFields ?? []}
              items={queryItems}
              queryIds={queryIds}
              onChange={(fields) => updatePopMonitoringFields(selectedPop.id, fields)}
              enableWarningThresholds
            />
            <div style={{ borderTop: '1px solid #405065', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <strong>Estado DOWN do POP (prioridade máxima)</strong>
              <small>DOWN vermelho pulsante + X &gt; ATENÇÃO amarela &gt; NORMAL ciano.</small>
              <small>O limite amarelo de CPU, memória, ping e outros itens é configurado em cada campo acima.</small>
              <small>Campo de monitoramento que determina DOWN:</small>
              <select
                style={inputStyle}
                value={selectedPop.alertRule?.fieldId ?? ''}
                onChange={(event) => {
                  const id = event.target.value;
                  const rule: PopAlertRule | undefined = id
                    ? { fieldId: id, operator: selectedPop.alertRule?.operator ?? 'eq', value: selectedPop.alertRule?.value ?? '0' }
                    : undefined;
                  updatePopProperties(selectedPop.id, { alertRule: rule });
                }}
              >
                <option value="">Sem regra DOWN</option>
                {(selectedPop.monitoringFields ?? []).map((field) => (
                  <option key={field.id} value={field.id}>{field.name || 'Campo sem nome'}</option>
                ))}
              </select>
              {selectedPop.alertRule && (
                <>
                  <small>Condição que significa POP indisponível:</small>
                  <select
                    style={inputStyle}
                    value={selectedPop.alertRule.operator}
                    onChange={(event) => updatePopProperties(selectedPop.id, {
                      alertRule: { ...selectedPop.alertRule!, operator: event.target.value as AlertOperator },
                    })}
                  >
                    <option value="eq">Igual a (=)</option>
                    <option value="ne">Diferente de (≠)</option>
                    <option value="gt">Maior que (&gt;)</option>
                    <option value="gte">Maior ou igual (≥)</option>
                    <option value="lt">Menor que (&lt;)</option>
                    <option value="lte">Menor ou igual (≤)</option>
                  </select>
                  <small>Valor de comparação (ex.: 0 para icmpping, 2 para ifOperStatus):</small>
                  <input
                    style={inputStyle}
                    value={selectedPop.alertRule.value}
                    onChange={(event) => updatePopProperties(selectedPop.id, {
                      alertRule: { ...selectedPop.alertRule!, value: event.target.value },
                    })}
                  />
                </>
              )}
              {selectedPopReport && (
                <small style={{ color: selectedPopReport.state === 'down' ? '#ff6675' : selectedPopReport.state === 'warning' ? '#facc15' : '#b5e4ff', fontWeight: 700 }}>
                  Estado do POP: {({ down: 'DOWN — vermelho pulsante', warning: 'ATENÇÃO — amarelo', ok: 'Operacional', 'no-data': 'Sem dados', normal: 'Sem regra' } as const)[selectedPopReport.state]}
                </small>
              )}
              {selectedPopReport?.downReason && (
                <AlertReasons title="Motivo do DOWN" reasons={[selectedPopReport.downReason]} tone="down" />
              )}
              {selectedPopReport && selectedPopReport.warningReasons.length > 0 && (
                <AlertReasons
                  title={selectedPopReport.state === 'down' ? 'Outros alertas de atenção' : 'Motivo(s) da atenção'}
                  reasons={selectedPopReport.warningReasons}
                  tone="warning"
                />
              )}
            </div>
              </>
            ) : (
              <>
                <MonitorFieldsReadout fields={selectedPop.monitoringFields ?? []} items={queryItems} />
                {selectedPopReport && (selectedPop.alertRule || (selectedPop.monitoringFields ?? []).some((field) => field.warningRule)) && (
                  <>
                    <small style={{ color: selectedPopReport.state === 'down' ? '#ff6675' : selectedPopReport.state === 'warning' ? '#facc15' : '#b5e4ff', fontWeight: 700 }}>
                      Estado: {({ down: 'DOWN', warning: 'ATENÇÃO', ok: 'Operacional', 'no-data': 'Sem dados', normal: 'Sem regra' } as const)[selectedPopReport.state]}
                    </small>
                    {selectedPopReport.downReason && (
                      <AlertReasons title="Motivo do DOWN" reasons={[selectedPopReport.downReason]} tone="down" />
                    )}
                    {selectedPopReport.warningReasons.length > 0 && (
                      <AlertReasons
                        title={selectedPopReport.state === 'down' ? 'Outros alertas de atenção' : 'Motivo(s) da atenção'}
                        reasons={selectedPopReport.warningReasons}
                        tone="warning"
                      />
                    )}
                    {selectedPopReport.state === 'no-data' && (
                      <small style={{ color: '#aebcd0' }}>Dados insuficientes para avaliar o estado. Verifique as queries e a coleta.</small>
                    )}
                  </>
                )}
              </>
            )}

            <div style={{ borderTop: '1px solid #405065', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <strong>Rotas conectadas ao POP</strong>
              {(() => {
                const routes = routesConnectedToPop(selectedPop.id, importedRoutes, links);
                const connectedLinks = linksConnectedToPop(selectedPop.id, links);
                return (
                  <>
                    <small>Saídas, chegadas e rotas utilizadas pelos enlaces cadastrados.</small>
                    {routes.length === 0 ? <small>Nenhuma rota KMZ associada a este POP.</small> : (
                      routes.map((route) => {
                        const direction = route.sourcePopId === selectedPop.id && route.targetPopId === selectedPop.id
                          ? 'Origem e destino' : route.sourcePopId === selectedPop.id ? 'Saída'
                          : route.targetPopId === selectedPop.id ? 'Chegada' : 'Via enlace monitorado';
                        return (
                          <div key={route.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <div style={{ flex: 1, overflowWrap: 'anywhere' }}>
                              <strong>{route.name}</strong><span style={{ color: '#9dd2e6' }}> · {direction}</span>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => zoomToRoute(mapRef.current, route)}>Ver</Button>
                          </div>
                        );
                      })
                    )}
                    <strong style={{ fontSize: 12 }}>Enlaces deste POP ({connectedLinks.length})</strong>
                    {connectedLinks.length === 0 ? <small>Nenhum enlace cadastrado.</small> : connectedLinks.map((link) => (
                      <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{link.name}</span>
                        <Button size="sm" variant="secondary" onClick={() => {
                          setSelectedLinkId(link.id);
                          setEditLinkName(link.name);
                          setSelectedId(null);
                        }}>Abrir</Button>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSelectedId(null);
                setConfirmDelete(false);
              }}
            >
              Fechar
            </Button>
          </div>
        )}

        {/* EDIÇÃO E VISUALIZAÇÃO DOS ENLACES */}
        {selectedLink && (
          <div className="teif-monitor-editor" style={editorCardStyle}>
            <strong>{editMode ? 'Editar enlace' : selectedLink.name}</strong>
            {editMode ? (
              <>
                <small>Nome do enlace</small>
                <input
                  style={inputStyle}
                  maxLength={120}
                  value={editLinkName}
                  onChange={(event) => setEditLinkName(event.target.value)}
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!editLinkName.trim()}
                  onClick={() => updateLinkProperties(selectedLink.id, { name: editLinkName.trim() })}
                >
                  Salvar nome
                </Button>
                <small>Cor do enlace</small>
                <input
                  type="color"
                  style={{ width: '100%', height: 32, cursor: 'pointer' }}
                  value={/^#[0-9a-fA-F]{6}$/.test(selectedLink.color) ? selectedLink.color : '#00ff66'}
                  onChange={(event) => updateLinkProperties(selectedLink.id, { color: event.target.value })}
                />
                <small>Espessura: {selectedLink.width} px</small>
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={selectedLink.width}
                  onChange={(event) => updateLinkProperties(selectedLink.id, { width: Number(event.target.value) })}
                />
                <div style={{ borderTop: '1px solid #405065', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <strong>Trajeto geográfico (KMZ/KML)</strong>
                  <small>Uma rota selecionada substitui a linha reta, mantendo cores, thresholds e DOWN em todo o trajeto.</small>
                  <select
                    style={inputStyle}
                    value={importedRoutes.some((route) => route.id === selectedLink.routeId) ? selectedLink.routeId : ''}
                    onChange={(event) => updateLinkProperties(selectedLink.id, { routeId: event.target.value || undefined })}
                  >
                    <option value="">Linha reta entre POPs (padrão)</option>
                    {importedRoutes.map((route) => (
                      <option key={route.id} value={route.id}>{route.name} — {route.sourceFile}</option>
                    ))}
                  </select>
                  {!!selectedLink.routeId && !importedRoutes.some((route) => route.id === selectedLink.routeId) && (
                    <small style={{ color: '#ffb45c' }}>O trajeto escolhido não existe mais; exibindo linha reta.</small>
                  )}
                  {importedRoutes.some((route) => route.id === selectedLink.routeId) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const route = importedRoutes.find((item) => item.id === selectedLink.routeId);
                        if (route) { zoomToRoute(mapRef.current, route); }
                      }}
                    >
                      Centralizar trajeto no mapa
                    </Button>
                  )}
                  <small>Os POPs continuam em suas posições originais. A geometria importada deve representar o cabo físico correspondente.</small>
                </div>

                <MonitorFieldsEditor
                  fields={selectedLink.monitoringFields ?? []}
                  items={queryItems}
                  queryIds={queryIds}
                  onChange={(fields) => updateLinkProperties(selectedLink.id, { monitoringFields: fields })}
                  enableWarningThresholds
                />
                {/* Qual métrica efetivamente determina o estado visual deste enlace? */}
                <div style={{ borderTop: '1px solid #405065', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <strong>Estado DOWN (prioridade máxima)</strong>
                  <small>Prioridade: DOWN vermelho &gt; qualquer threshold amarelo &gt; cor normal.</small>
                  <small>Configure os thresholds AMARELOS individualmente em cada campo de monitoramento acima.</small>
                  <small>Campo de status que controla o vermelho pulsante e o X</small>
                  <select
                    style={inputStyle}
                    value={selectedLink.alertRule?.fieldId ?? ''}
                    onChange={(event) => {
                      const id = event.target.value;
                      const next: LinkAlertRule | undefined = id
                        ? { fieldId: id, operator: selectedLink.alertRule?.operator ?? 'eq', value: selectedLink.alertRule?.value ?? '0' }
                        : undefined;
                      updateLinkProperties(selectedLink.id, { alertRule: next });
                    }}
                  >
                    <option value="">Sem regra DOWN (usa os thresholds amarelos)</option>
                    {(selectedLink.monitoringFields ?? []).map((field) => (
                      <option key={field.id} value={field.id}>{field.name || 'Campo sem nome'}</option>
                    ))}
                  </select>
                  {selectedLink.alertRule && (
                    <>
                      <small>Gerar alerta quando o valor do campo for:</small>
                      <select
                        style={inputStyle}
                        value={selectedLink.alertRule.operator}
                        onChange={(event) => updateLinkProperties(selectedLink.id, {
                          alertRule: { ...selectedLink.alertRule!, operator: event.target.value as AlertOperator },
                        })}
                      >
                        <option value="eq">Igual a (=)</option>
                        <option value="ne">Diferente de (≠)</option>
                        <option value="gt">Maior que (&gt;)</option>
                        <option value="gte">Maior ou igual (≥)</option>
                        <option value="lt">Menor que (&lt;)</option>
                        <option value="lte">Menor ou igual (≤)</option>
                      </select>
                      <small>Valor de comparação (ex.: 0, 2, DOWN ou X)</small>
                      <input
                        style={inputStyle}
                        value={selectedLink.alertRule.value}
                        onChange={(event) => updateLinkProperties(selectedLink.id, {
                          alertRule: { ...selectedLink.alertRule!, value: event.target.value },
                        })}
                      />
                      <small style={{ color: '#b6c4d5' }}>
                        Alerta: vermelho fraco/forte a cada 650 ms, sem apagar o cabo.
                        O X é visual; não indica o ponto físico da falha.
                      </small>
                    </>
                  )}
                  <small style={{ color: '#f8dc81' }}>
                    Estado final: {({
                      normal: 'Cor manual', ok: 'Operacional — cor manual',
                      down: 'DOWN — vermelho pulsante + X',
                      warning: 'ATENÇÃO — amarelo fixo',
                      'no-data': 'SEM DADOS — cinza tracejado',
                    } as const)[selectedLinkReport?.state ?? 'normal']}
                  </small>
                  {selectedLinkReport?.downReason && (
                    <AlertReasons title="Motivo do DOWN" reasons={[selectedLinkReport.downReason]} tone="down" />
                  )}
                  {selectedLinkReport && selectedLinkReport.warningReasons.length > 0 && (
                    <AlertReasons
                      title={selectedLinkReport.state === 'down' ? 'Outros alertas de atenção' : 'Motivo(s) da atenção'}
                      reasons={selectedLinkReport.warningReasons}
                      tone="warning"
                    />
                  )}
                </div>
                {!confirmDeleteLink ? (
                  <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteLink(true)}>Excluir enlace</Button>
                ) : (
                  <>
                    <small>Esta operação removerá o enlace e seus campos associados.</small>
                    <Button size="sm" variant="primary" onClick={() => {
                      const current = optionsRef.current;
                      changeCurrentOptions({ ...current, links: (current.links ?? []).filter((item) => item.id !== selectedLink.id) });
                      setSelectedLinkId(null);
                      setConfirmDeleteLink(false);
                    }}>Confirmar exclusão</Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteLink(false)}>Cancelar exclusão</Button>
                  </>
                )}
              </>
            ) : (
              <>
                <MonitorFieldsReadout fields={selectedLink.monitoringFields ?? []} items={queryItems} />
                {(selectedLink.alertRule || (selectedLink.monitoringFields ?? []).some((field) => field.warningRule)) && selectedLinkReport && (
                  <>
                    <small style={{ color: selectedLinkReport.state === 'down' ? '#ff6675' : selectedLinkReport.state === 'warning' ? '#facc15' : '#b5e4ff', fontWeight: 700 }}>
                      Estado: {({ down: 'DOWN', warning: 'ATENÇÃO', ok: 'Operacional', 'no-data': 'Sem dados', normal: 'Sem regra' } as const)[selectedLinkReport.state]}
                    </small>
                    {selectedLinkReport.downReason && (
                      <AlertReasons title="Motivo do DOWN" reasons={[selectedLinkReport.downReason]} tone="down" />
                    )}
                    {selectedLinkReport.warningReasons.length > 0 && (
                      <AlertReasons
                        title={selectedLinkReport.state === 'down' ? 'Outros alertas de atenção' : 'Motivo(s) da atenção'}
                        reasons={selectedLinkReport.warningReasons}
                        tone="warning"
                      />
                    )}
                    {selectedLinkReport.state === 'no-data' && (
                      <small style={{ color: '#aebcd0' }}>Não foi possível avaliar todas as regras. Verifique as queries e os itens selecionados.</small>
                    )}
                  </>
                )}
              </>
            )}
            <Button size="sm" variant="secondary" onClick={() => { setSelectedLinkId(null); setConfirmDeleteLink(false); }}>
              Fechar
            </Button>
          </div>
        )}

        {/* CONTADORES */}
        {editMode && (
          <div
            style={{
              ...cardStyle,
              width: 'auto',
              padding: '6px 10px',
              flexShrink: 0,
            }}
          >
            <small>
              POPs: {pops.length}
              {' | '}
              Enlaces: {links.length}
            </small>
          </div>
        )}
      </div>
    </div>
  );
};

