// Uma métrica configurável associada a um POP ou enlace.
export type MonitorUnit = 'auto' | 'bps' | 'Bps' | 'percent' | 'ms' | 'dBm' | 'none';

export interface MonitorField {
  id: string;
  name: string;
  queryRefId: string;
  itemKey: string;
  unit: MonitorUnit;
  /** Regra individual de ATENÇÃO aplicável a POPs e enlaces. */
  warningRule?: FieldWarningRule;
}

/** Operadores para as regras de atenção e de indisponibilidade. */
export type AlertOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

export interface FieldWarningRule {
  operator: AlertOperator;
  value: string;
}

/** Regra de DOWN (vermelho) com prioridade máxima, em POPs e enlaces. */
export interface LinkAlertRule {
  fieldId: string;
  operator: AlertOperator;
  value: string;
}

/** Mesmo formato de configuração da regra DOWN de um enlace. */
export type PopAlertRule = LinkAlertRule;

/** Posição geográfica [latitude, longitude] no formato Leaflet. */
export type MapLatLng = [number, number];

/** Uma rota KML pode ter vários trechos não contínuos (MultiGeometry). */
export interface ImportedRoute {
  id: string;
  name: string;
  sourceFile: string;
  segments: MapLatLng[][];
  /** Associação lógica às extremidades; não altera a geometria original. */
  sourcePopId?: string;
  targetPopId?: string;
}

/** Referência do KML; não cria automaticamente um POP monitorado. */
export interface ImportedWaypoint {
  id: string;
  name: string;
  sourceFile: string;
  position: MapLatLng;
  /** Ponto promovido ou vinculado a um POP. Impede criar POP duplicado. */
  linkedPopId?: string;
}

export interface BackbonePop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** ID do waypoint que deu origem a este POP, quando aplicável. */
  importedWaypointId?: string;
  monitoringFields?: MonitorField[];
  /** Opcional: campo e condição que deixam o POP vermelho pulsante. */
  alertRule?: PopAlertRule;
}

export interface BackboneLink {
  id: string;
  name: string;
  sourcePopId: string;
  targetPopId: string;
  color: string;
  width: number;
  /** Quando definido, desenha o trajeto importado em vez da linha reta. */
  routeId?: string;
  monitoringFields?: MonitorField[];
  alertRule?: LinkAlertRule;
}

export interface SimpleOptions {
  latitude?: number;
  longitude?: number;
  zoom?: number;

  pops?: BackbonePop[];
  links?: BackboneLink[];
  /** Geometrias KMZ/KML salvas junto às opções do dashboard. */
  importedRoutes?: ImportedRoute[];
  importedWaypoints?: ImportedWaypoint[];
  /** Exibir rotas e pontos de referência que não são um enlace vinculado. */
  showKmzPreview?: boolean;
}
