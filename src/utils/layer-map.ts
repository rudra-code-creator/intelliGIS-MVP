import type { LayerId } from '@/types/master-plan'

/** Maps sidebar layer IDs to master plan GeoJSON keys */
export const LAYER_ID_TO_SOURCE: Partial<Record<LayerId, string>> = {
  'green-space': 'green_space',
  'bike-network': 'bike_paths',
  roads: 'roads',
  parks: 'parks',
  residential: 'residential',
  commercial: 'commercial',
  industrial: 'industrial',
  transit: 'transit',
  schools: 'schools',
  hospitals: 'hospitals',
}

export function isLayerSourceVisible(sourceKey: string, visibility: Record<string, boolean>): boolean {
  const entry = Object.entries(LAYER_ID_TO_SOURCE).find(([, src]) => src === sourceKey)
  if (!entry) return true
  return visibility[entry[0]] ?? true
}
