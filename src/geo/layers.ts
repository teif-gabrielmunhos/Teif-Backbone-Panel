/**
 * Teif Backbone Panel v1.2 — protótipo de núcleo de camadas.
 * Módulo independente para integrar ao plugin após inspeção da v1.1.
 * Entrada: GeoJSON produzido a partir do KMZ.
 * NÃO converte KMZ nem renderiza Leaflet; separa dados e decide visibilidade.
 */
export type Categoria = 'backbone' | 'ftth' | 'outros';
export type BoundingBox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

export interface FeatureDaRede {
  type: 'Feature';
  id?: string | number;
  properties?: {
    name?: string;
    pasta?: string;
    projeto?: string;
    classe?: string;
    marcador?: string;
    descricao?: string;
    [extra: string]: unknown;
  } | null;
  geometry: { type: string; coordinates: unknown } | null;
}

export interface GeoJSONDaRede {
  type: 'FeatureCollection';
  features: FeatureDaRede[];
}

export interface FeatureIndexada {
  id: string;
  feature: FeatureDaRede;
  bbox: BoundingBox;
  projeto: string;
  categoria: Categoria;
  marcador: string;
  // Marcadores distintos, sem assumir que qualquer ponto é um POP.
  ePop: boolean;
  /** Tipo de referência declarada no GeoJSON: não representa status de monitoramento. */
  tipoPonto: 'pop' | 'hub' | 'infra' | 'outro';
}

export interface FiltroCamadas {
  bbox: BoundingBox;
  zoom: number;
  projetos?: ReadonlySet<string>;
  backbone: boolean;
  ftth: boolean;
  outros: boolean;
  // Exibe a rede de acesso só quando suficientemente aproximada.
  zoomMinimoFtth?: number;
  // Limite de proteção da interface, não é uma garantia de FPS.
  maximo?: number;
  /** Opcional: descarta pontos antes do limite de quantidade de geometrias. */
  pontos?: boolean;
}

function coordenadasValidas(x: unknown): x is number[] {
  return Array.isArray(x) && x.length >= 2 &&
    typeof x[0] === 'number' && Number.isFinite(x[0]) &&
    typeof x[1] === 'number' && Number.isFinite(x[1]);
}

function bboxDaGeometria(geometry: FeatureDaRede['geometry']): BoundingBox | null {
  if (!geometry) return null;
  const tipo = geometry.type;
  if (!['Point', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'MultiPoint'].includes(tipo)) {
    return null;
  }
  const result: BoundingBox = [Infinity, Infinity, -Infinity, -Infinity];
  let encontrados = 0;
  function percorrer(value: unknown): void {
    if (coordenadasValidas(value)) {
      const [lon, lat] = value;
      if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return;
      result[0] = Math.min(result[0], lon);
      result[1] = Math.min(result[1], lat);
      result[2] = Math.max(result[2], lon);
      result[3] = Math.max(result[3], lat);
      encontrados++;
      return;
    }
    if (Array.isArray(value)) value.forEach(percorrer);
  }
  percorrer(geometry.coordinates);
  return encontrados ? result : null;
}

function normalizarCategoria(classe: unknown): Categoria {
  const valor = String(classe ?? '').trim().toLowerCase();
  return valor === 'backbone' || valor === 'ftth' ? valor : 'outros';
}

export function criarIndiceCamadas(colecao: GeoJSONDaRede): FeatureIndexada[] {
  const usados = new Set<string>();
  const resultado: FeatureIndexada[] = [];
  for (let i = 0; i < colecao.features.length; i++) {
    const feature = colecao.features[i];
    const bbox = bboxDaGeometria(feature.geometry);
    if (!bbox) continue;
    let id = String(feature.id ?? `kmz-index-${i + 1}`);
    if (usados.has(id)) id = `${id}-idx-${i + 1}`;
    usados.add(id);
    const propriedades = feature.properties ?? {};
    resultado.push({
      id,
      feature,
      bbox,
      projeto: String(propriedades.projeto ?? 'SEM PROJETO'),
      categoria: normalizarCategoria(propriedades.classe),
      marcador: String(propriedades.marcador ?? '').toUpperCase(),
      ePop: feature.geometry?.type === 'Point' && String(propriedades.marcador ?? '').toUpperCase() === 'POP',
      tipoPonto: feature.geometry?.type !== 'Point' ? 'outro' :
        String(propriedades.marcador ?? '').toUpperCase() === 'POP' ? 'pop' :
        String(propriedades.marcador ?? '').toUpperCase() === 'HUB' ? 'hub' :
        String(propriedades.marcador ?? '').toUpperCase() === 'INFRA' ? 'infra' : 'outro',
    });
  }
  return resultado;
}

function intersecciona(a: BoundingBox, b: BoundingBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function filtrarCamadas(indice: readonly FeatureIndexada[], opcoes: FiltroCamadas): FeatureIndexada[] {
  const saida: FeatureIndexada[] = [];
  const maximo = Math.max(0, Math.floor(opcoes.maximo ?? 2000));
  for (const item of indice) {
    if (opcoes.pontos === false && item.feature.geometry?.type === 'Point') continue;
    if (opcoes.projetos && !opcoes.projetos.has(item.projeto)) continue;
    // POPs confirmados permanecem visíveis se o backbone estiver ativo.
    const visivel = item.ePop ? opcoes.backbone :
      item.categoria === 'backbone' ? opcoes.backbone :
      item.categoria === 'ftth' ? (opcoes.ftth && opcoes.zoom >= (opcoes.zoomMinimoFtth ?? 13)) :
      opcoes.outros;
    if (!visivel || !intersecciona(item.bbox, opcoes.bbox)) continue;
    if (saida.length >= maximo) break;
    saida.push(item);
  }
  return saida;
}


// ================================================================
// v1.2: classificação e filtro do modelo KMZ nativo do plugin.
// GeoJSON acima permanece disponível para a próxima etapa (fonte externa).
// ================================================================
import type { ImportedRoute, ImportedWaypoint, KmzCategory, KmzLayerSettings } from '../types';

export const DEFAULT_KMZ_LAYER_SETTINGS: KmzLayerSettings = {
  project: '', backbone: true, ftth: true, outros: true, points: true, minZoomFtth: 0,
};

export function definirConfiguracaoCamadas(value?: Partial<KmzLayerSettings>): KmzLayerSettings {
  const zoom = Number(value?.minZoomFtth ?? 0);
  return {
    project: String(value?.project ?? ''),
    backbone: value?.backbone ?? true,
    ftth: value?.ftth ?? true,
    outros: value?.outros ?? true,
    points: value?.points ?? true,
    minZoomFtth: Number.isFinite(zoom) ? Math.max(0, Math.min(19, zoom)) : 0,
  };
}

function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

/** Nunca infere que um ponto do KML é um POP monitorado. */
export function classificarElementoKmz(
  name: string,
  folderPath = '',
  kind: 'route' | 'point' = 'route'
): { project: string; category: KmzCategory } {
  const parts = folderPath.split('/').map(p => p.trim()).filter(Boolean);
  const ignorar = /^(PROJETO COMPLETO(?:\s*\d.*)?|OUTROS PROJETOS|NOVAS|DOC\.KML)$/;
  const meaningful = parts.filter(p => !ignorar.test(normalizarTexto(p)) &&
    !normalizarTexto(p).endsWith('.KMZ'));
  const project = meaningful[0] ?? 'SEM PROJETO';
  const haystack = normalizarTexto(`${folderPath} ${name}`);
  // Subpasta BACKBONE prevalece sobre a pasta superior FTTH, quando presente.
  const backbone = /BACKBONE|\bTRONCAL\b|\bANEL OPTICO\b/.test(haystack);
  const ftth = /FTTH|\bDROP\b|\bCTO\b|\bNAP\b|DISTRIBUICAO/.test(haystack);
  return { project, category: backbone ? 'backbone' : ftth ? 'ftth' : 'outros' };
}

export type KmzNativeFeature = ImportedRoute | ImportedWaypoint;
export function informacaoKmz(item: KmzNativeFeature): { project: string; category: KmzCategory } {
  const inferred = classificarElementoKmz(item.name, item.folderPath ?? '');
  return {
    project: item.project || inferred.project,
    category: item.category || inferred.category,
  };
}

export function projetosKmz(routes: readonly ImportedRoute[], points: readonly ImportedWaypoint[]): string[] {
  return [...new Set([...routes, ...points].map(item => informacaoKmz(item).project))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function camadaVisivel(item: KmzNativeFeature, settings: KmzLayerSettings, zoom: number): boolean {
  const { category, project } = informacaoKmz(item);
  if (settings.project && settings.project !== project) { return false; }
  if ('position' in item && !settings.points) { return false; }
  if (category === 'backbone') { return settings.backbone; }
  if (category === 'ftth') { return settings.ftth && zoom >= settings.minZoomFtth; }
  return settings.outros;
}

/** Apenas candidatos explícitos. HUB/infraestrutura nunca se tornam POPs automaticamente. */
export function candidatosGeojson(indice: readonly FeatureIndexada[]): FeatureIndexada[] {
  return indice.filter((item) => item.tipoPonto === 'pop' || item.tipoPonto === 'hub');
}

/** Coordenada [lat,lon] validada de um ponto geográfico. */
export function posicaoCandidato(item: FeatureIndexada): [number, number] | null {
  if (item.feature.geometry?.type !== 'Point') { return null; }
  const coordinates = item.feature.geometry.coordinates;
  if (!coordenadasValidas(coordinates)) { return null; }
  const [lon, lat] = coordinates;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) { return null; }
  return [lat, lon];
}
