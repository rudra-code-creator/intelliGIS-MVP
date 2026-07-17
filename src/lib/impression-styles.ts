/** Artist-impression palette (architectural bird's-eye render) */
export const IMPRESSION = {
  buildingFill: '#ffffff',
  buildingOutline: '#94a3b8',
  buildingShadow: '#cbd5e1',
  residentialFill: '#f8f6f2',
  /** Dark enough to read on colourful basemaps and white building blocks */
  road: '#57534e',
  roadArterial: '#292524',
  roadCasing: '#ffffff',
  park: '#4ade80',
  parkTree: '#16a34a',
  preserve: '#86efac',
  transit: '#ef4444',
  bike: '#00b8a0',
  existingBuilding: '#64748b',
  /** Hard-constraint overlays (match OSM basemap cues) */
  water: '#7dd3fc',
  railway: '#171717',
  hardHighway: '#ef4444',
  arterial: '#f59e0b',
} as const
