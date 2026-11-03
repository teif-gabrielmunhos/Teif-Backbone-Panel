import * as L from 'leaflet';
import type { FeatureIndexada } from './layers';

/** Renderiza apenas geometria conhecida. Tooltips são sempre texto puro (sem HTML do KMZ). */
function ponto(value: unknown): L.LatLngTuple | null {
  if (!Array.isArray(value) || value.length < 2) { return null; }
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) { return null; }
  return [lat, lon];
}
function linha(value: unknown): L.LatLngTuple[] {
  if (!Array.isArray(value)) { return []; }
  return value.map(ponto).filter((p): p is L.LatLngTuple => p !== null);
}
function linhas(value: unknown): L.LatLngTuple[][] {
  if (!Array.isArray(value)) { return []; }
  return value.map(linha).filter(part => part.length >= 2);
}

/** Coordenadas de um ou mais trechos de fibra do GeoJSON externo.
 * Reutilizadas pelo destaque e pelo enlace monitorado, sem copiar geometria ao dashboard.
 */
export function segmentosDeFibraGeoJson(item: FeatureIndexada): L.LatLngTuple[][] {
  const geometry = item.feature.geometry;
  if (!geometry) { return []; }
  if (geometry.type === 'LineString') {
    const coords = linha(geometry.coordinates);
    return coords.length > 1 ? [coords] : [];
  }
  if (geometry.type === 'MultiLineString') { return linhas(geometry.coordinates); }
  return [];
}

export function criarCamadaGeoJson(item: FeatureIndexada, renderer: L.Renderer): L.Layer | null {
  const g = item.feature.geometry;
  if (!g) { return null; }
  // v1.2 — Contraste para OpenStreetMap claro.
  // Cores de categoria geográfica, NÃO correspondem ao status do Zabbix.
  // Reservamos verde/amarelo/vermelho para os enlaces monitorados.
  const isLine = g.type === 'LineString' || g.type === 'MultiLineString';
  const color = item.tipoPonto === 'pop' ? '#0ba67d' : item.tipoPonto === 'hub' ? '#37a2fb' :
    item.categoria === 'backbone' ? '#8B5CF6' : // violeta: distinto de rios/vegetação
    item.categoria === 'ftth' ? '#D97706' :     // laranja queimado: rede de acesso
    '#667085';                                // ardósia: infraestrutura secundária
  const style: L.PolylineOptions = {
    renderer,
    color,
    weight: isLine ? (item.categoria === 'backbone' ? 4 : item.categoria === 'ftth' ? 2.7 : 2) : 2,
    opacity: isLine ? (item.categoria === 'backbone' ? 0.95 : item.categoria === 'ftth' ? 0.88 : 0.65) : 0.78,
    // Diferencia 'Outros' mesmo para pessoas com dificuldade de distinguir cores.
    ...(isLine && item.categoria === 'outros' ? { dashArray: '5 7' } : {}),
    interactive: true,
    bubblingMouseEvents: false,
  };
  let result: L.Path | null = null;
  if (g.type === 'Point') {
    const coords = ponto(g.coordinates);
    if (coords) {
      result = L.circleMarker(coords, { ...style, radius: item.ePop ? 7 : item.tipoPonto === 'hub' ? 4 : 3, fillOpacity: item.ePop ? 1 : 0.7 });
    }
  } else if (g.type === 'LineString') {
    const coords = linha(g.coordinates);
    if (coords.length >= 2) { result = L.polyline(coords, style); }
  } else if (g.type === 'MultiLineString') {
    const coords = linhas(g.coordinates);
    if (coords.length) { result = L.polyline(coords, style); }
  } else if (g.type === 'Polygon') {
    const rings = linhas(g.coordinates);
    if (rings.length) { result = L.polygon(rings, { ...style, fillOpacity: 0.09 }); }
  } else if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    const polygons = g.coordinates.map(linhas).filter(rings => rings.length);
    if (polygons.length) { result = L.polygon(polygons, { ...style, fillOpacity: 0.09 }); }
  }
  if (result) {
    const element = document.createElement('span');
    element.textContent = `${item.feature.properties?.name ?? 'Elemento KMZ'} · ${item.tipoPonto === 'pop' ? 'POP (referência)' : item.tipoPonto === 'hub' ? 'HUB (referência)' : item.projeto} · ${item.projeto}`;
    result.bindTooltip(element, { sticky: true });
  }
  return result;
}
