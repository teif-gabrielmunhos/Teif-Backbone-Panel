import type { BackboneLink, BackbonePop, ImportedRoute, MapLatLng } from './types';

/** Distância geográfica aproximada entre dois pontos (metros). */
export function distanceMeters(a: MapLatLng, b: MapLatLng): number {
  const radians = Math.PI / 180;
  const dLat = (b[0] - a[0]) * radians;
  const dLon = (b[1] - a[1]) * radians;
  const lat1 = a[0] * radians;
  const lat2 = b[0] * radians;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  )));
}

/** Verificação de duplicação apenas por localização; associação automática não é feita. */
export function nearbyPop(position: MapLatLng, pops: BackbonePop[], radiusMeters = 10): BackbonePop | undefined {
  return pops.find(pop => distanceMeters(position, [pop.latitude, pop.longitude]) <= radiusMeters);
}

/** Sugestão por proximidade às extremidades, sem criar associações silenciosamente. */
export function routeEndpointSuggestions(
  route: ImportedRoute,
  pops: BackbonePop[],
  radiusMeters = 100
): { sourcePopId?: string; targetPopId?: string } {
  const first = route.segments.find(segment => segment.length >= 2);
  const last = [...route.segments].reverse().find(segment => segment.length >= 2);
  if (!first || !last) { return {}; }
  const nearest = (point: MapLatLng): string | undefined => {
    let bestDistance = radiusMeters;
    let bestId: string | undefined;
    for (const pop of pops) {
      const meters = distanceMeters(point, [pop.latitude, pop.longitude]);
      if (meters <= bestDistance) {
        bestDistance = meters;
        bestId = pop.id;
      }
    }
    return bestId;
  };
  return {
    sourcePopId: nearest(first[0]),
    targetPopId: nearest(last[last.length - 1]),
  };
}

/** Uma rota física está conectada se for vinculada manualmente ao POP
 * ou se o POP for uma extremidade de um enlace monitorado usando essa rota. */
export function routesConnectedToPop(popId: string, routes: ImportedRoute[], links: BackboneLink[]): ImportedRoute[] {
  const linkRouteIds = new Set(links
    .filter(link => link.sourcePopId === popId || link.targetPopId === popId)
    .map(link => link.routeId)
    .filter((id): id is string => Boolean(id)));
  return routes.filter(route =>
    route.sourcePopId === popId || route.targetPopId === popId || linkRouteIds.has(route.id)
  );
}

export function linksConnectedToPop(popId: string, links: BackboneLink[]): BackboneLink[] {
  return links.filter(link => link.sourcePopId === popId || link.targetPopId === popId);
}
