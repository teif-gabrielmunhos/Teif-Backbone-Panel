
export interface BackbonePop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface BackboneLink {
  id: string;
  name: string;
  sourcePopId: string;
  targetPopId: string;
  color: string;
  width: number;
}

export interface SimpleOptions {
  latitude?: number;
  longitude?: number;
  zoom?: number;

  pops?: BackbonePop[];
  links?: BackboneLink[];
}

