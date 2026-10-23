import JSZip from 'jszip';
import type { ImportedRoute, ImportedWaypoint, MapLatLng } from './types';

/**
 * Importador local KMZ/KML. Não faz upload do arquivo nem executa conteúdo KML.
 * Mantém exclusivamente geometrias lineares e pontos de referência.
 */
export const KMZ_LIMITS = {
  compressedBytes: 12 * 1024 * 1024,
  kmlChars: 8 * 1024 * 1024,
  routes: 200,
  waypoints: 500,
  vertices: 15000,
} as const;

export interface ImportedMapData {
  routes: ImportedRoute[];
  waypoints: ImportedWaypoint[];
}

function validCoordinates(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** KML usa longitude,latitude[,altitude], mas Leaflet usa latitude,longitude. */
function parseKmlCoordinates(text: string): MapLatLng[] {
  const result: MapLatLng[] = [];
  const tuples = text.trim().split(/\s+/).filter(Boolean);
  for (const tuple of tuples) {
    const parts = tuple.split(',');
    if (parts.length < 2) {
      throw new Error('Trajeto KMZ contém coordenadas incompletas.');
    }
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!validCoordinates(lat, lng)) {
      throw new Error('Trajeto KMZ contém latitude ou longitude inválida.');
    }
    result.push([lat, lng]);
  }
  return result;
}

/** gx:Track possui gx:coord="longitude latitude altitude" (sem vírgulas). */
function parseTrackCoordinates(track: Element): MapLatLng[] {
  const result: MapLatLng[] = [];
  for (const child of Array.from(track.getElementsByTagName('*'))) {
    if (child.localName !== 'coord') { continue; }
    const values = (child.textContent ?? '').trim().split(/\s+/);
    if (values.length < 2) { continue; }
    const lng = Number(values[0]);
    const lat = Number(values[1]);
    if (!validCoordinates(lat, lng)) {
      throw new Error('gx:Track contém coordenadas inválidas.');
    }
    result.push([lat, lng]);
  }
  return result;
}

function descendantsByName(root: Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((item) => item.localName === name);
}

function directChildText(root: Element, name: string): string | undefined {
  return Array.from(root.children).find((child) => child.localName === name)?.textContent?.trim();
}

function coordinatesInside(root: Element): string | undefined {
  return descendantsByName(root, 'coordinates')[0]?.textContent?.trim();
}

function shortText(text: string, fallback: string): string {
  return text.trim().slice(0, 120) || fallback;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseKmlText(xml: string, sourceFile: string): ImportedMapData {
  if (xml.length > KMZ_LIMITS.kmlChars) {
    throw new Error('KML muito grande. Reduza as rotas antes de importar.');
  }
  // Arquivos KML não devem conter entidades externas nem DTD.
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new Error('KML com DTD/entidades não é aceito por segurança.');
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('KML inválido: falha ao interpretar o XML.');
  }
  const root = doc.documentElement;
  const placemarks = Array.from(doc.getElementsByTagName('*'))
    .filter((node) => node.localName === 'Placemark');
  if (!root || !placemarks.length) {
    throw new Error('Nenhum Placemark KML encontrado no arquivo.');
  }

  const routes: ImportedRoute[] = [];
  const waypoints: ImportedWaypoint[] = [];
  for (const placemark of placemarks) {
    const name = shortText(directChildText(placemark, 'name') ?? '', `Trajeto ${routes.length + 1}`);
    const segments: MapLatLng[][] = [];
    for (const line of descendantsByName(placemark, 'LineString')) {
      const raw = coordinatesInside(line);
      if (!raw) { continue; }
      const coords = parseKmlCoordinates(raw);
      if (coords.length >= 2) { segments.push(coords); }
    }
    for (const track of descendantsByName(placemark, 'Track')) {
      const coords = parseTrackCoordinates(track);
      if (coords.length >= 2) { segments.push(coords); }
    }
    if (segments.length) {
      routes.push({ id: newId('route'), name, sourceFile, segments });
    }
    for (const point of descendantsByName(placemark, 'Point')) {
      const raw = coordinatesInside(point);
      if (!raw) { continue; }
      const coords = parseKmlCoordinates(raw);
      if (coords.length) {
        waypoints.push({
          id: newId('waypoint'), name, sourceFile, position: coords[0],
        });
      }
    }
  }
  if (!routes.length && !waypoints.length) {
    throw new Error('KML sem trajetos LineString/gx:Track ou pontos Point reconhecidos.');
  }
  validateGeometry({ routes, waypoints });
  return { routes, waypoints };
}

export function validateGeometry(data: ImportedMapData): void {
  if (data.routes.length > KMZ_LIMITS.routes) {
    throw new Error(`Máximo de ${KMZ_LIMITS.routes} trajetos por painel.`);
  }
  if (data.waypoints.length > KMZ_LIMITS.waypoints) {
    throw new Error(`Máximo de ${KMZ_LIMITS.waypoints} pontos de referência por painel.`);
  }
  const vertices = data.routes.reduce((sum, route) =>
    sum + route.segments.reduce((n, segment) => n + segment.length, 0), 0);
  if (vertices > KMZ_LIMITS.vertices) {
    throw new Error(`KMZ excedeu ${KMZ_LIMITS.vertices.toLocaleString('pt-BR')} coordenadas. Simplifique o trajeto antes de importar para evitar dashboards excessivamente grandes.`);
  }
}

export async function importMapFile(file: File): Promise<ImportedMapData> {
  const extension = file.name.toLowerCase();
  if (!extension.endsWith('.kml') && !extension.endsWith('.kmz')) {
    throw new Error('Selecione um arquivo .kmz ou .kml.');
  }
  if (file.size > KMZ_LIMITS.compressedBytes) {
    throw new Error('Arquivo maior que 12 MB. Reduza-o antes de importar.');
  }
  if (extension.endsWith('.kml')) {
    return parseKmlText(await file.text(), file.name);
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const files = Object.values(zip.files)
    .filter((entry) => !entry.dir && /\.kml$/i.test(entry.name) && !entry.name.startsWith('__MACOSX/'));
  if (!files.length) {
    throw new Error('KMZ não contém nenhum arquivo KML.');
  }
  // KMZ pode conter doc.kml e outros KMLs. Lemos cada um para não perder trechos.
  const routes: ImportedRoute[] = [];
  const waypoints: ImportedWaypoint[] = [];
  for (const entry of files) {
    // Evita expandir entradas XML enormes/ZIP bombs, quando metadados disponíveis.
    const reportedSize = (entry as typeof entry & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof reportedSize === 'number' && reportedSize > KMZ_LIMITS.kmlChars) {
      throw new Error(`KML interno muito grande: ${entry.name}`);
    }
    const text = await entry.async('string');
    const parsed = parseKmlText(text, `${file.name} / ${entry.name}`);
    routes.push(...parsed.routes);
    waypoints.push(...parsed.waypoints);
    validateGeometry({ routes, waypoints });
  }
  return { routes, waypoints };
}
